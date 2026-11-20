#!/usr/bin/env python3
"""Record the Deliverable 2 demo against the real app with REAL testnet transfers, both directions:

  inbound : Base Sepolia -> Stellar testnet   (the D2 deliverable)
  outbound: Stellar testnet -> Base Sepolia   (the return leg)

Real: the browser UI (visible cursor, typed amounts/addresses, real clicks), wallet connects
(EVM via the demo wallet, Stellar via an emulated Rabet), approve/burn/attestation/mint, and the live
Blockscout / Stellar Expert pages. Stubbed: only the hosted AutoRamp API (down), i.e. auth/profile and
bridge bookkeeping/history - the History tab shows what the app builds from /bridge/history.

Prereqs: demo wallet server on :8787 (scripts/demo-wallet-server.mjs), dev server on :3000 with
NEXT_PUBLIC_NETWORK=testnet and STELLAR_RELAYER_SECRET (inbound mint relay).
Usage: DEMO_WALLET_FILE=~/.config/autoramp-demo/wallet.json python3 scripts/record_d2_real.py \
         [--dry] [--legs in|out|both] [--amount-in 2] [--amount-out 1]
Outputs (demo_assets_d2/): raw_<legs>.webm, marks_<legs>.json (scene start times), run_<legs>.json (all hashes)
"""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP_URL", "http://localhost:3000")
OUT = "demo_assets_d2"
DRY = "--dry" in sys.argv


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


LEGS = arg("--legs", "both")
AMOUNT_IN = arg("--amount-in", "2")
AMOUNT_OUT = arg("--amount-out", "1")
WALLET = json.load(open(os.environ["DEMO_WALLET_FILE"]))
EVM_ADDR = WALLET["evm"]["address"]
STELLAR_G = WALLET["stellar"]["address"]
os.makedirs(OUT, exist_ok=True)
VIDEO_DIR = os.path.join(OUT, "raw_video_real")
os.makedirs(VIDEO_DIR, exist_ok=True)

PROVIDER_JS = open("scripts/demo-wallet-provider.js").read()
# The cursor overlay adds DOM nodes; React explorers (Blockscout) break if that happens before hydration,
# so it is added only after the page has fully loaded.
CURSOR_JS = """
(() => {
  const mk = () => {
    if (document.getElementById('demo-cursor')) return;
    const c = document.createElement('div'); c.id = 'demo-cursor';
    c.style.cssText = 'position:fixed;left:-50px;top:-50px;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-4px,-2px);';
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M3 2l7 19 3-8 8-3z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const st = document.createElement('style');
    st.textContent = '@keyframes demoRipple{from{transform:scale(.3);opacity:.9}to{transform:scale(2.4);opacity:0}}nextjs-portal,#nprogress,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}';
    document.documentElement.appendChild(st);
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', e => {
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;left:${e.clientX-18}px;top:${e.clientY-18}px;width:36px;height:36px;border-radius:50%;border:3px solid #00F9C7;z-index:2147483646;pointer-events:none;animation:demoRipple .5s ease-out forwards`;
      document.documentElement.appendChild(r); setTimeout(() => r.remove(), 600);
    }, true);
  };
  addEventListener('load', () => setTimeout(mk, 2500));
})();
"""

API_MODE = arg("--api", "stub")      # "stub": local stand-in for the AutoRamp API; "real": the real backend with AUTORAMP_TOKEN
API_URL = os.environ.get("AUTORAMP_API_URL", "https://api-autoramp.thebuidl.xyz")
USER = {"id": "demo-user", "email": "demo@autoramp.test", "role": "USER", "phoneNumber": "+2340000000000", "isMerchant": False}
AUTH_TOKEN = "demo-token"
if API_MODE == "real":
    import urllib.request
    AUTH_TOKEN = os.environ["AUTORAMP_TOKEN"]
    _req = urllib.request.Request(API_URL + "/user/profile", headers={"Authorization": f"Bearer {AUTH_TOKEN}", "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", "Accept": "application/json"})
    _prof = json.load(urllib.request.urlopen(_req, timeout=20))
    _prof = _prof.get("data", _prof)
    USER = {k: _prof.get(k) for k in ("id", "email", "role", "phoneNumber", "isMerchant")}
    print(f"[api] REAL backend {API_URL} as user {USER['id']}", flush=True)
AUTH = json.dumps({"state": {"user": USER, "token": AUTH_TOKEN, "_hasHydrated": True}, "version": 0})
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"}
AD_HOSTS = ("cdn.adx.ws", "adx.ws", "doubleclick.net", "googlesyndication.com", "adtrafficquality.google",
            "googleadservices.com", "coinzilla.com", "slise.xyz", "adbutler.com", "bitmedia.io", "a-ads.com")

BRIDGES = []   # one dict per transfer the app initiates: {ref, fromChain, toChain, amount, source, dest, createdAt}
marks, T0 = [], None
pos = [960, 540]


def mark(name):
    marks.append({"scene": name, "t": round(time.time() - T0, 2)})
    print(f"[mark] {name} @ {marks[-1]['t']}s", flush=True)


def install_adblock(ctx):
    for host in AD_HOSTS:  # Blockscout serves third-party (incl. gambling) ads; never show them
        ctx.route(f"**://*{host}/**", lambda r: r.abort())
        ctx.route(f"**://{host}/**", lambda r: r.abort())


def observe_api(ctx):
    """Real-API mode: don't touch the app's traffic, just record the hashes it reports to the backend."""
    def on_request(req):
        if req.method == "POST" and "/bridge/update-hash" in req.url:
            d = req.post_data_json or {}
            b = next((x for x in BRIDGES if x["ref"] == d.get("reference")), None)
            if not b:
                b = {"ref": d.get("reference"), "fromChain": None, "toChain": None, "amount": None, "source": None, "dest": None,
                     "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())}
                BRIDGES.append(b)
            if d.get("step") == "SOURCE_TX": b["source"] = d.get("hash")
            if d.get("step") == "DESTINATION_TX": b["dest"] = d.get("hash")
            print(f"[api] update-hash {d.get('step')} {d.get('hash')}", flush=True)
    ctx.on("request", on_request)


def end(name):
    """Mark where a scene's real footage ends (called right before we navigate away)."""
    marks.append({"scene": name + "__end", "t": round(time.time() - T0, 2)})


def install_stubs(ctx):
    def stub(pattern, fn):
        def handler(route):
            if route.request.method == "OPTIONS":
                return route.fulfill(status=204, headers=CORS)
            status, body = fn(route.request)
            route.fulfill(status=status, content_type="application/json", headers=CORS, body=json.dumps(body))
        ctx.route(pattern, handler)

    # catch-all FIRST (later registrations win): the hosted API is down, don't wait on cert/DNS errors
    ctx.route("**/autoramp-api.thebuidl.org/**", lambda r: r.fulfill(status=404, content_type="application/json", headers=CORS, body='{"status":"error"}'))

    stub("**/user/profile*", lambda req: (200, {"status": "success", "data": USER, **USER}))
    stub("**/merchants/status*", lambda req: (200, {"status": "success", "data": {"onboardingStaus": "UNVERIFIED"}}))
    stub("**/merchants/otc-status*", lambda req: (200, {"status": "success", "data": {"isOTCEnabled": False}}))
    stub("**/bridge/supported-chains*", lambda req: (200, {"chains": ["Ethereum_Sepolia", "Base_Sepolia", "Solana_Devnet", "Stellar_Testnet"]}))

    def initiate(req):
        d = req.post_data_json or {}
        b = {"ref": f"BRG-{int(time.time())}-{len(BRIDGES)+1}", "fromChain": d.get("fromChain"), "toChain": d.get("toChain"),
             "amount": d.get("amount"), "source": None, "dest": None,
             "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())}
        BRIDGES.append(b)
        return 200, {"status": "success", "reference": b["ref"]}
    stub("**/bridge/initiate*", initiate)

    def update(req):
        d = req.post_data_json or {}
        b = next((x for x in BRIDGES if x["ref"] == d.get("reference")), None)
        if b:
            if d.get("step") == "SOURCE_TX": b["source"] = d.get("hash")
            if d.get("step") == "DESTINATION_TX": b["dest"] = d.get("hash")
        print(f"[api] update-hash {d.get('step')} {d.get('hash')}", flush=True)
        return 200, {"success": True}
    stub("**/bridge/update-hash*", update)

    def status(req):
        ref = req.url.rstrip("/").split("/")[-1].split("?")[0]
        b = next((x for x in BRIDGES if x["ref"] == ref), None)
        if not b:
            return 404, {"status": "error"}
        return 200, {"status": "COMPLETED" if b["dest"] else "PROCESSING", "reference": b["ref"], "transactionHash": b["dest"] or b["source"],
                     "metadata": {"SOURCE_TX": b["source"], "DESTINATION_TX": b["dest"]}}
    stub("**/bridge/status/*", status)

    def history(req):  # what the real backend's GET /bridge/history returns (no hashes; the page fetches status on expand)
        txs = [{"reference": b["ref"], "status": "SUCCESS" if b["dest"] else "PROCESSING", "fromChain": b["fromChain"], "toChain": b["toChain"],
                "amount": b["amount"], "transactionHash": b["dest"] or b["source"], "createdAt": b["createdAt"]} for b in reversed(BRIDGES)]
        return 200, {"total": len(txs), "transactions": txs}
    stub("**/bridge/history*", history)
    stub("**/ramp/transactions*", lambda req: (200, {"onramp": [], "offramp": [], "swap": [], "total": 0, "page": 1, "limit": 10, "totalPages": 1}))


def glide(page, x, y, steps=28, delay=12):
    x0, y0 = pos
    for i in range(1, steps + 1):
        t = i / steps
        e = t * t * (3 - 2 * t)  # smoothstep
        page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
        page.wait_for_timeout(delay)
    pos[0], pos[1] = x, y


def center(loc):
    loc.scroll_into_view_if_needed(timeout=8000)
    b = loc.bounding_box()
    return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2


def click(page, loc, pause=350):
    x, y = center(loc)
    glide(page, x, y)
    page.wait_for_timeout(pause)
    page.mouse.click(x, y)
    page.wait_for_timeout(250)


def type_slow(page, text, delay=190):
    page.keyboard.type(text, delay=delay)


def shot(page, name):
    page.screenshot(path=os.path.join(OUT, f"debug_{name}.png"))


def wait_ready(page, tries=5):
    for i in range(tries):
        try:
            page.wait_for_selector("header", timeout=20000)
            page.wait_for_timeout(800)
            return
        except Exception:
            print(f"[ready] splash still up (try {i+1}); reloading", flush=True)
            page.reload(wait_until="domcontentloaded")
    raise RuntimeError("app never left the splash screen")


def hover_idle(page, spots, secs):
    """Keep the cursor gently moving while we wait on real network time."""
    end, i = time.time() + secs, 0
    while time.time() < end:
        x, y = spots[i % len(spots)]
        glide(page, x, y, steps=22)
        page.wait_for_timeout(1800)
        i += 1


def go_home_bridge(page):
    page.goto(APP, wait_until="domcontentloaded"); wait_ready(page)
    page.mouse.move(960, 400); pos[:] = [960, 400]
    click(page, page.get_by_role("button", name="Bridge", exact=True).first)
    page.wait_for_timeout(1200)


def wait_transfer(page, bridge_idx, label):
    t0 = time.time()
    spots = [(960, 420), (1000, 520), (900, 600), (1050, 470)]
    while time.time() < t0 + 9 * 60:
        if page.get_by_text("Bridge failed").count():
            shot(page, f"{label}_failed")
            raise RuntimeError(f"{label}: the app reported 'Bridge failed' (a burn may already have happened - check the log)")
        b = BRIDGES[bridge_idx] if len(BRIDGES) > bridge_idx else None
        if b and b["dest"]:
            print(f"[{label}] done in {time.time()-t0:.0f}s  source={b['source']} dest={b['dest']}", flush=True)
            return b
        hover_idle(page, spots, 6)
    shot(page, f"{label}_timeout")
    raise RuntimeError(f"{label} transfer did not complete in 9 minutes")


def explorer_scene(page, name, url, ready_text, moves, hold=2.2):
    """Open a real explorer page, wait until it has rendered, then mark the scene and move the cursor."""
    page.goto(url, wait_until="domcontentloaded")
    page.get_by_text(ready_text, exact=True).first.wait_for(timeout=90000)
    page.wait_for_timeout(1500)
    page.mouse.move(700, 400); pos[:] = [700, 400]
    mark(name)
    for x, y in moves:
        glide(page, x, y); page.wait_for_timeout(int(hold * 1000))
    end(name)


BLOCKSCOUT_MOVES = [(820, 485), (550, 529), (690, 529), (740, 830)]   # hash, status, method, tokens
STELLAR_MOVES = [(460, 215), (460, 240), (900, 466)]                  # tx id, status/ledger, invoked contract call


def history_scene(page, name):
    for attempt in range(1, 5):
        page.goto(APP + "/history", wait_until="domcontentloaded"); wait_ready(page)
        page.get_by_text("Bridge", exact=True).first.wait_for(timeout=30000)
        page.wait_for_timeout(5000)   # let late hydration settle before filming
        if page.locator("header").count() and page.get_by_text("Bridge", exact=True).count():
            break
        print(f"[history] page not stable (attempt {attempt}); retrying", flush=True)
    page.mouse.move(960, 400); pos[:] = [960, 400]
    mark(name)
    glide(page, 960, 300); page.wait_for_timeout(1800)
    trig = page.locator("button[data-state]").filter(has_text=re.compile("Bridge", re.I)).first
    for k in range(3):
        click(page, trig); page.wait_for_timeout(2500)
        if trig.get_attribute("data-state") == "open":
            break
        print(f"[history] row did not open (click {k+1}); trying again", flush=True)
    shot(page, f"{name}_open")
    page.wait_for_timeout(1500)
    glide(page, 960, 620); page.wait_for_timeout(2500)
    glide(page, 960, 480); page.wait_for_timeout(2200)
    end(name)


def connect_evm(page):
    connect = page.get_by_role("button", name=re.compile(r"^\s*connect wallet\s*$", re.I)).first
    click(page, connect)
    page.wait_for_timeout(1500); shot(page, "wallet_modal")
    click(page, page.get_by_text(re.compile(r"^(Browser Wallet|Injected Wallet)$")).first)
    page.wait_for_timeout(3000); shot(page, "evm_connected")


def connect_stellar(page):
    click(page, page.get_by_role("button", name=re.compile(r"connect stellar", re.I)).first)
    page.wait_for_timeout(1800); shot(page, "stellar_modal")
    click(page, page.get_by_text("Rabet", exact=True).first)
    page.wait_for_timeout(3000); shot(page, "stellar_connected")


def pick_network(page, which, name_re):
    click(page, page.locator(f"button:has-text('{which} NETWORK')").first)
    page.wait_for_timeout(1200); shot(page, f"{which.lower()}_modal")
    click(page, page.get_by_text(name_re).first)
    page.wait_for_timeout(1500)


def fill_amount_and_dest(page, amount, dest):
    click(page, page.locator('input[placeholder="0.00"]').first)
    type_slow(page, amount)
    page.wait_for_timeout(1200)
    d = page.get_by_placeholder(re.compile(r"^(0x|G)")).first
    click(page, d)
    type_slow(page, dest, delay=45)
    page.wait_for_timeout(1500); shot(page, "form_filled")
    glide(page, 1100, 560); page.wait_for_timeout(1500)


def click_bridge(page):
    click(page, page.get_by_role("button", name=re.compile(r"^\s*bridge\s*$", re.I)).last)


def main():
    global T0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-gpu"])
        # warm-up (unrecorded) so dev compilation never lands on camera
        w = browser.new_context(viewport={"width": 1920, "height": 1080}); wp = w.new_page()
        for path in ("/", "/history"):
            wp.goto(APP + path, timeout=240000); wait_ready(wp)
        w.close()

        ctx = browser.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=1,
                                  record_video_dir=VIDEO_DIR, record_video_size={"width": 1920, "height": 1080})
        ctx.add_init_script(PROVIDER_JS)
        ctx.add_init_script(CURSOR_JS)
        ctx.add_init_script(f'localStorage.setItem("autoramp-network","testnet");document.cookie="autoramp-network=testnet; path=/";'
                            f'localStorage.setItem("auth-storage",{json.dumps(AUTH)});localStorage.setItem("token",{json.dumps(AUTH_TOKEN)});')
        install_adblock(ctx)
        if API_MODE == "stub":
            install_stubs(ctx)
        else:
            observe_api(ctx)
        if API_MODE == "stub" and LEGS == "out" and os.path.exists(f"{OUT}/run_in.json"):
            for b in json.load(open(f"{OUT}/run_in.json")).get("bridges", []):
                BRIDGES.append(b)   # the real inbound transfer recorded earlier
            print(f"[preload] {len(BRIDGES)} earlier bridge(s) for History", flush=True)
        page = ctx.new_page()
        rec_start = time.time()
        page.on("console", lambda m: print("[console.error]", m.text[:160], flush=True) if m.type == "error" and "ERR_" not in m.text and "404" not in m.text else None)

        page.goto(APP, timeout=240000)
        wait_ready(page)
        lead = time.time() - rec_start  # video before this is load time; trimmed when stitching
        T0 = time.time()
        page.mouse.move(960, 540)
        run = {"wallet_evm": EVM_ADDR, "wallet_stellar": STELLAR_G}

        if LEGS in ("in", "both"):
            # ---- 1. intro: a tour of the real UI ----
            mark("intro")
            tour = [(545, 67), (843, 67), (929, 67), (1017, 67), (1245, 67), (960, 175), (960, 320), (759, 323), (892, 323),
                    (1026, 323), (1160, 323), (960, 560), (960, 760), (960, 420)]
            for x, y in tour:
                glide(page, x, y, steps=30); page.wait_for_timeout(1700)

            # ---- 2. connect the EVM wallet ----
            mark("connect")
            click(page, page.get_by_role("button", name="Bridge", exact=True).first)
            page.wait_for_timeout(1200)
            connect_evm(page)
            glide(page, 1100, 500); page.wait_for_timeout(2500)

            # ---- 3. form: Base Sepolia (default) -> Stellar Testnet (default) ----
            mark("form")
            glide(page, 1090, 460); page.wait_for_timeout(1800)   # FROM: Base Sepolia
            glide(page, 1090, 620); page.wait_for_timeout(1800)   # TO: Stellar Testnet
            fill_amount_and_dest(page, AMOUNT_IN, STELLAR_G)

            if DRY:
                print("[dry] inbound form filled; stopping before BRIDGE", flush=True)
            else:
                # ---- 4. the real inbound transfer ----
                mark("transfer")
                n0 = len(BRIDGES)
                click_bridge(page)
                b = wait_transfer(page, n0, "inbound")
                run["inbound"] = {"amount": AMOUNT_IN, "source_tx": b["source"], "dest_tx": b["dest"], "reference": b["ref"]}
                page.wait_for_timeout(4000); shot(page, "inbound_completed")
                glide(page, 960, 470); page.wait_for_timeout(2500)
                end("transfer")

                # ---- 5-6. real explorers ----
                explorer_scene(page, "explorer_src", f"https://base-sepolia.blockscout.com/tx/{b['source']}", "Transaction hash", BLOCKSCOUT_MOVES)
                explorer_scene(page, "explorer_dst", f"https://stellar.expert/explorer/testnet/tx/{b['dest']}", "Summary", STELLAR_MOVES)

                # ---- 7. history: the transfer is listed as a Bridge ----
                history_scene(page, "history")

        if LEGS in ("out", "both"):
            # ---- return leg: Stellar -> Base ----
            go_home_bridge(page)
            mark("o_intro")
            glide(page, 1090, 460); page.wait_for_timeout(1500)
            glide(page, 1090, 620); page.wait_for_timeout(1500)

            mark("o_connect")
            if page.get_by_role("button", name=re.compile(r"^\s*connect wallet\s*$", re.I)).count():
                connect_evm(page)       # Base wallet receives the USDC and signs the mint
            connect_stellar(page)
            glide(page, 1100, 700); page.wait_for_timeout(2000)

            mark("o_form")
            # The From list hides whatever To is set to, so Stellar can't be picked directly while To=Stellar;
            # the app's own swap button flips Base -> Stellar into Stellar -> Base.
            click(page, page.locator("button:has(svg.lucide-arrow-up-down)").first)
            page.wait_for_timeout(1500); shot(page, "swapped")
            fill_amount_and_dest(page, AMOUNT_OUT, EVM_ADDR)

            if DRY:
                print("[dry] outbound form filled; stopping before BRIDGE", flush=True)
                shot(page, "dry_outbound")
                ctx.close(); browser.close(); return

            mark("o_transfer")
            n0 = len(BRIDGES)
            click_bridge(page)
            b = wait_transfer(page, n0, "outbound")
            run["outbound"] = {"amount": AMOUNT_OUT, "source_tx": b["source"], "dest_tx": b["dest"], "reference": b["ref"]}
            page.wait_for_timeout(4000); shot(page, "outbound_completed")
            glide(page, 960, 470); page.wait_for_timeout(2500)
            end("o_transfer")

            explorer_scene(page, "o_explorer_src", f"https://stellar.expert/explorer/testnet/tx/{b['source']}", "Summary", STELLAR_MOVES)
            explorer_scene(page, "o_explorer_dst", f"https://base-sepolia.blockscout.com/tx/{b['dest']}", "Transaction hash", BLOCKSCOUT_MOVES)
            history_scene(page, "o_history")

        # ---- outro ----
        page.goto(APP, wait_until="domcontentloaded"); wait_ready(page)
        page.mouse.move(960, 400); pos[:] = [960, 400]
        mark("outro")
        glide(page, 960, 480); page.wait_for_timeout(3500)
        marks.append({"scene": "end", "t": round(time.time() - T0, 2)})

        vpath = page.video.path()
        ctx.close(); browser.close()
        if DRY:
            return
        raw = os.path.join(OUT, f"raw_{LEGS}.webm")
        os.replace(vpath, raw)
        json.dump({"lead": round(lead, 2), "marks": marks}, open(os.path.join(OUT, f"marks_{LEGS}.json"), "w"), indent=2)
        run["bridges"] = BRIDGES
        json.dump(run, open(os.path.join(OUT, f"run_{LEGS}.json"), "w"), indent=2)
        print("saved", raw, flush=True)


if __name__ == "__main__":
    main()
