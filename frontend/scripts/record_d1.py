#!/usr/bin/env python3
"""Record the Deliverable 1 walkthrough (hardened Stellar USDC off-ramp) against the real app.

REAL:  the app UI, the live AutoRamp API (AUTORAMP_TOKEN), the user's real completed Stellar testnet cash-out
       (shown from the API, with its Stellar Expert page), and the four real Stellar testnet USDC deposits made by
       scripts/d1-real-deposits.mjs (their hashes are opened on Stellar Expert).
STAGED: the failure scenarios (timeout, partial settlement, rejected payout, reversal, insufficient liquidity).
       Their detail/history responses are fed to the REAL UI by intercepting the browser's API calls, and every
       staged screen carries an on-screen "SIMULATED" banner. Nothing is written to the backend or a database.

Usage: AUTORAMP_TOKEN=... python3 scripts/record_d1.py [--dry] [--real-ref off_stellar_real_proof]
Outputs (demo_assets_d1/): raw_d1.webm, marks_d1.json, run_d1.json
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP_URL", "http://localhost:3000")
API_URL = os.environ.get("AUTORAMP_API_URL", "https://api-autoramp.thebuidl.xyz")
OUT = "demo_assets_d1"
DRY = "--dry" in sys.argv


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


REAL_REF = arg("--real-ref", "off_stellar_real_proof")
TOKEN = os.environ["AUTORAMP_TOKEN"]
DEPOSITS = json.load(open("../autoramp-backend/docs/d1-evidence/real-deposits.json"))["deposits"]
os.makedirs(OUT, exist_ok=True)
VIDEO_DIR = os.path.join(OUT, "raw_video")
os.makedirs(VIDEO_DIR, exist_ok=True)

# reuse the D2 cursor overlay (added only after load so React hydration is untouched)
_src = open("scripts/record_d2_real.py").read()
CURSOR_JS = _src[_src.index('CURSOR_JS = """') + len('CURSOR_JS = """'):_src.index('"""', _src.index('CURSOR_JS = """') + 20)]

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"}
AD_HOSTS = ("cdn.adx.ws", "adx.ws", "doubleclick.net", "googlesyndication.com", "adtrafficquality.google",
            "googleadservices.com", "coinzilla.com", "slise.xyz", "adbutler.com", "bitmedia.io", "a-ads.com")

marks, T0, pos = [], None, [960, 540]


def mark(name):
    marks.append({"scene": name, "t": round(time.time() - T0, 2)})
    print(f"[mark] {name} @ {marks[-1]['t']}s", flush=True)


def end(name):
    marks.append({"scene": name + "__end", "t": round(time.time() - T0, 2)})


# ---------------------------------------------------------------------------
# Staged scenarios (SIMULATED provider outcomes). Deposits are real testnet hashes.
# ---------------------------------------------------------------------------
def iso(minutes_ago):
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(time.time() - minutes_ago * 60))


def settlement(expected, received):
    e, r = float(expected), float(received)
    return {"expected": f"{e:.7f}", "received": f"{r:.7f}", "outstanding": f"{max(e - r, 0):.7f}", "excess": "0.0000000",
            "kind": "NONE" if r == 0 else "PARTIAL" if r < e else "FULL"}


def staged(ref, status, label, message, *, deposit, expected_usdc, received_usdc, fiat, reason=None, detail=None,
           tx=None, reversal=None, history, actual_fiat=None, minutes_ago=40):
    return {
        "reference": ref, "internalId": "sim-" + ref, "status": status, "rawStatus": status, "statusLabel": label,
        "statusMessage": message, "successful": status == "COMPLETED", "sourceAsset": "USDC", "depositAmount": f"{float(deposit):.7f}",
        "expectedPayout": {"amount": str(fiat), "currency": "NGN"}, "actualPayout": {"amount": actual_fiat, "currency": "NGN"},
        "conversion": {"rate": 1600, "from": "USDC", "to": "NGN"}, "settlement": settlement(expected_usdc, received_usdc),
        "failureReason": reason, "failureDetail": detail, "stellarTxHash": tx, "reversal": reversal,
        "timestamps": {"createdAt": iso(minutes_ago), "updatedAt": iso(1), "completedAt": None},
        "statusHistory": [{"from": a, "to": b, "at": iso(minutes_ago if m == 0 else m), "reason": why, "actor": who, "inferred": False} for a, b, m, why, who in history],
        "auditLog": [], "reconciliation": None,
    }


D = {k: v["hash"] for k, v in DEPOSITS.items()}
STAGED = {
    "sim_timeout_demo": staged("sim_timeout_demo", "EXPIRED", "Expired", "This cash-out timed out before it completed. If you already sent USDC, contact support with your reference and transaction hash.",
        deposit="5", expected_usdc="5", received_usdc="0", fiat=8000, reason="timeout", minutes_ago=45,
        detail={"stateWhenExpired": "AWAITING_DEPOSIT", "windowMs": 1800000, "since": iso(45), "message": "USDC deposit not received before the payout funding window closed"},
        history=[(None, "INITIATED", 0, "Cash-out created", "system"), ("INITIATED", "AWAITING_DEPOSIT", 0, "Funding instructions issued", "system"), ("AWAITING_DEPOSIT", "EXPIRED", 15, "timeout", "expiry-sweeper")]),
    "sim_partial_demo": staged("sim_partial_demo", "PARTIALLY_SETTLED", "Partially settled", "Only part of the expected amount was received. The outstanding amount is shown below; contact support to complete or refund it.",
        deposit="2.5", expected_usdc="5", received_usdc="2.5", fiat=8000, reason="partial_settlement", tx=D["partial"], minutes_ago=30,
        history=[(None, "INITIATED", 0, "Cash-out created", "system"), ("INITIATED", "AWAITING_DEPOSIT", 0, "Funding instructions issued", "system"), ("AWAITING_DEPOSIT", "DEPOSIT_DETECTED", 12, "Stellar deposit detected", "stellar-watcher"), ("DEPOSIT_DETECTED", "PARTIALLY_SETTLED", 11, "partial_settlement", "bitnob-webhook")]),
    "sim_rejected_demo": staged("sim_rejected_demo", "REJECTED", "Payout rejected", "The payout was rejected by the payout provider. This transaction was not paid out; contact support with your reference.",
        deposit="1", expected_usdc="1", received_usdc="1", fiat=1600, reason="rejected", tx=D["rejected"], minutes_ago=25,
        detail={"providerResponse": {"code": "ACCOUNT_RESTRICTED", "message": "Beneficiary account restricted"}},
        history=[(None, "INITIATED", 0, "Cash-out created", "system"), ("INITIATED", "AWAITING_DEPOSIT", 0, "Funding instructions issued", "system"), ("AWAITING_DEPOSIT", "DEPOSIT_DETECTED", 8, "Stellar deposit detected", "stellar-watcher"), ("DEPOSIT_DETECTED", "PROCESSING", 7, "Deposit confirmed", "bitnob-webhook"), ("PROCESSING", "PAYOUT_PENDING", 6, "Payout submitted", "payout-gate"), ("PAYOUT_PENDING", "REJECTED", 4, "rejected", "bitnob-webhook")]),
    "sim_reversal_demo": staged("sim_reversal_demo", "REVERSED", "Reversed", "This payout was reversed. See the reversal details; contact support if you need help.",
        deposit="1", expected_usdc="1", received_usdc="1", fiat=1600, reason="reversal", tx=D["reversal"], minutes_ago=20,
        reversal={"amount": "1.0000000", "reason": "Interbank clearing reversal", "at": iso(2), "originalStatus": "COMPLETED"},
        history=[(None, "INITIATED", 0, "Cash-out created", "system"), ("INITIATED", "AWAITING_DEPOSIT", 0, "Funding instructions issued", "system"), ("AWAITING_DEPOSIT", "DEPOSIT_DETECTED", 8, "Stellar deposit detected", "stellar-watcher"), ("DEPOSIT_DETECTED", "COMPLETED", 6, "settled", "bitnob-webhook"), ("COMPLETED", "REVERSED", 2, "reversal", "bitnob-webhook")]),
    "sim_liquidity_demo": staged("sim_liquidity_demo", "INSUFFICIENT_LIQUIDITY", "Insufficient liquidity", "There is not enough payout liquidity right now. Your transaction is on hold for review and can be retried; contact support with your reference.",
        deposit="1", expected_usdc="1", received_usdc="1", fiat=1600, reason="insufficient_liquidity", tx=D["liquidity"], minutes_ago=15,
        detail={"required": "1.0000000", "available": "0.5000000", "shortfall": "0.5000000"},
        history=[(None, "INITIATED", 0, "Cash-out created", "system"), ("INITIATED", "AWAITING_DEPOSIT", 0, "Funding instructions issued", "system"), ("AWAITING_DEPOSIT", "DEPOSIT_DETECTED", 8, "Stellar deposit detected", "stellar-watcher"), ("DEPOSIT_DETECTED", "PROCESSING", 7, "Deposit confirmed", "bitnob-webhook"), ("PROCESSING", "INSUFFICIENT_LIQUIDITY", 6, "insufficient_liquidity", "payout-gate")]),
}


def legacy_row(v):
    return {"id": v["internalId"], "reference": v["reference"], "status": v["status"], "createdAt": v["timestamps"]["createdAt"],
            "updatedAt": v["timestamps"]["updatedAt"], "amount": float(v["expectedPayout"]["amount"]), "fiatAmount": float(v["expectedPayout"]["amount"]), "currency": "NGN", "tokenType": "USDC",
            "bankName": "Demo Bank", "accountNumber": "0123456789", "accountName": "Demo Account"}


def install_routes(ctx):
    for host in AD_HOSTS:
        ctx.route(f"**://*{host}/**", lambda r: r.abort())
        ctx.route(f"**://{host}/**", lambda r: r.abort())

    DEAD = "autoramp-api.thebuidl.org"   # the app bundle was built with this (dead) host; send its calls to the live API

    def live(route):
        """Forward a request to the real backend and return its response (with CORS for the localhost page)."""
        req = route.request
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        url = req.url.replace("https://" + DEAD, API_URL.rstrip("/"))
        resp = route.fetch(url=url, headers={**req.headers, "user-agent": UA, "origin": API_URL})
        return resp, route

    def proxy(route):
        out = live(route)
        if isinstance(out, tuple):
            resp = out[0]
            hdrs = {k: v for k, v in resp.headers.items() if k.lower() not in ("content-encoding", "content-length", "transfer-encoding", "access-control-allow-origin")}
            route.fulfill(status=resp.status, headers={**hdrs, **CORS}, body=resp.body())
    ctx.route(f"**://{DEAD}/**", proxy)   # registered first: the specific handlers below take precedence

    def detail(route):
        req = route.request
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        ref = req.url.split("?")[0].rstrip("/").split("/")[-1]
        if ref in STAGED:
            v = STAGED[ref]
            return route.fulfill(status=200, content_type="application/json", headers=CORS,
                                 body=json.dumps({"transaction": legacy_row(v), "history": [], "view": v}))
        proxy(route)
    ctx.route("**/ramp/offramp/*", detail)

    def txs(route):
        if route.request.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        out = live(route)
        if not isinstance(out, tuple):
            return
        resp = out[0]
        try:
            body = resp.json()
            body["offramp"] = [legacy_row(v) for v in reversed(list(STAGED.values()))] + (body.get("offramp") or [])
            body["total"] = (body.get("total") or 0) + len(STAGED)
            return route.fulfill(status=resp.status, body=json.dumps(body), headers={**CORS, "content-type": "application/json"})
        except Exception:
            return route.fulfill(status=resp.status, body=resp.body(), headers=CORS)
    ctx.route("**/ramp/transactions*", txs)


# ---------------------------------------------------------------------------
# Browser helpers (same look as D2)
# ---------------------------------------------------------------------------
def glide(page, x, y, steps=28, delay=12):
    x0, y0 = pos
    for i in range(1, steps + 1):
        t = i / steps
        e = t * t * (3 - 2 * t)
        page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
        page.wait_for_timeout(delay)
    pos[0], pos[1] = x, y


def click(page, loc, pause=350):
    loc.scroll_into_view_if_needed(timeout=8000)
    b = loc.bounding_box()
    x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    glide(page, x, y)
    page.wait_for_timeout(pause)
    page.mouse.click(x, y)
    page.wait_for_timeout(250)


def wait_ready(page, tries=5):
    for _ in range(tries):
        try:
            page.wait_for_selector("header", timeout=20000)
            page.wait_for_timeout(800)
            return
        except Exception:
            page.reload(wait_until="domcontentloaded")
    raise RuntimeError("app never left the splash screen")


def set_banner(page, text):
    """On-screen label (fixed overlay added after load). Empty text removes it."""
    page.evaluate("""(text) => {
      document.getElementById('d1-banner')?.remove();
      if (!text) return;
      const b = document.createElement('div'); b.id = 'd1-banner';
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483645;padding:10px 16px;text-align:center;font:600 18px system-ui,sans-serif;letter-spacing:.04em;background:#f59e0b;color:#111;pointer-events:none';
      b.textContent = text; document.documentElement.appendChild(b);
    }""", text)


def goto(page, path, wait_selector):
    page.goto(APP + path, wait_until="domcontentloaded")
    wait_ready(page)
    page.wait_for_selector(wait_selector, timeout=30000)
    page.wait_for_timeout(1200)
    page.mouse.move(960, 400); pos[:] = [960, 400]


def detail_scene(page, name, ref, simulated, tour, secs=11):
    """Open /history/<ref>, label it, and glide the cursor over the relevant sections."""
    goto(page, f"/history/{ref}", '[data-testid="offramp-detail"]')
    set_banner(page, "SIMULATED PROVIDER OUTCOME — staged data in the real UI (not a live transaction)" if simulated else "")
    mark(name)
    for sel in tour:
        loc = page.locator(sel).first
        if loc.count():
            loc.scroll_into_view_if_needed(timeout=5000)
            b = loc.bounding_box()
            glide(page, b["x"] + min(b["width"] / 2, 400), b["y"] + b["height"] / 2)
            page.wait_for_timeout(max(1500, int(secs * 1000 / max(len(tour), 1))))
    end(name)


def explorer_scene(page, name, url):
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(6000)
    page.evaluate(CURSOR_JS) if False else None
    page.mouse.move(960, 400); pos[:] = [960, 400]
    mark(name)
    for y in (300, 420, 540):
        glide(page, 960, y); page.wait_for_timeout(1800)
    end(name)


def main():
    global T0
    run = {"api": API_URL, "real_reference": REAL_REF, "real_deposits": DEPOSITS, "staged": list(STAGED)}
    import urllib.request
    req = urllib.request.Request(API_URL + "/user/profile", headers={"Authorization": f"Bearer {TOKEN}", "User-Agent": UA, "Accept": "application/json"})
    prof = json.load(urllib.request.urlopen(req, timeout=20)); prof = prof.get("data", prof)
    user = {k: prof.get(k) for k in ("id", "email", "role", "phoneNumber", "isMerchant")}
    auth = json.dumps({"state": {"user": user, "token": TOKEN, "_hasHydrated": True}, "version": 0})
    print(f"[api] REAL backend {API_URL} as {user['id']}", flush=True)
    req = urllib.request.Request(f"{API_URL}/ramp/offramp/{REAL_REF}", headers={"Authorization": f"Bearer {TOKEN}", "User-Agent": UA})
    real = json.load(urllib.request.urlopen(req, timeout=20)); real = real.get("data", real)
    real_hash = ((real.get("transaction") or {}).get("providerOrder") or {}).get("depositTxHash")
    print(f"[api] real cash-out {REAL_REF}: status={real['transaction']['status']} hash={real_hash}", flush=True)
    run["real_status"] = real["transaction"]["status"]; run["real_hash"] = real_hash

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-gpu"])
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=1,
                                  record_video_dir=VIDEO_DIR, record_video_size={"width": 1920, "height": 1080})
        ctx.add_init_script(CURSOR_JS)
        ctx.add_init_script(f'localStorage.setItem("autoramp-network","testnet");document.cookie="autoramp-network=testnet; path=/";'
                            f'localStorage.setItem("auth-storage",{json.dumps(auth)});localStorage.setItem("token",{json.dumps(TOKEN)});')
        install_routes(ctx)
        page = ctx.new_page()
        rec_start = time.time()
        page.goto(APP + "/history", wait_until="domcontentloaded"); wait_ready(page)
        page.wait_for_timeout(3000)
        T0 = time.time(); lead = T0 - rec_start

        # 1. intro: history list with every status
        mark("intro")
        glide(page, 960, 500); page.wait_for_timeout(2500)
        glide(page, 960, 700); page.wait_for_timeout(2500)
        end("intro")

        # 2. real, successful cash-out (live API) + its Stellar deposit on the explorer
        detail_scene(page, "real_success", REAL_REF, False,
                     ['[data-testid="offramp-status"]', '[data-testid="field-actual-payout"]', '[data-testid="field-stellar-hash"]', '[data-testid="status-history"]'], 16)
        if real_hash:
            explorer_scene(page, "real_explorer", f"https://stellar.expert/explorer/testnet/tx/{real_hash}")

        if DRY:
            print("[dry] stopping after the real scenes", flush=True)
            ctx.close(); browser.close(); return

        # 3-7. staged failure scenarios (each labelled SIMULATED on screen)
        detail_scene(page, "sim_timeout", "sim_timeout_demo", True, ['[data-testid="offramp-status"]', '[data-testid="failure-detail"]', '[data-testid="status-history"]'], 14)
        detail_scene(page, "sim_partial", "sim_partial_demo", True, ['[data-testid="offramp-status"]', '[data-testid="settlement"]', '[data-testid="status-history"]'], 14)
        explorer_scene(page, "partial_explorer", DEPOSITS["partial"]["url"])
        detail_scene(page, "sim_rejected", "sim_rejected_demo", True, ['[data-testid="offramp-status"]', '[data-testid="failure-detail"]', '[data-testid="field-stellar-hash"]'], 14)
        detail_scene(page, "sim_reversal", "sim_reversal_demo", True, ['[data-testid="offramp-status"]', '[data-testid="reversal"]', '[data-testid="status-history"]'], 14)
        detail_scene(page, "sim_liquidity", "sim_liquidity_demo", True, ['[data-testid="offramp-status"]', '[data-testid="failure-detail"]', '[data-testid="status-history"]'], 14)

        # 8. persistence: reload the real transaction; state is identical (comes from the server)
        goto(page, f"/history/{REAL_REF}", '[data-testid="offramp-detail"]')
        mark("persist")
        glide(page, 960, 420); page.wait_for_timeout(2500)
        page.reload(wait_until="domcontentloaded"); wait_ready(page)
        page.wait_for_selector('[data-testid="offramp-detail"]', timeout=30000)
        page.wait_for_timeout(1500)
        glide(page, 900, 460); page.wait_for_timeout(3000)
        end("persist")

        # 9. history list shows all statuses
        goto(page, "/history", "text=Insufficient liquidity")
        set_banner(page, "Real transaction + 5 SIMULATED provider outcomes (staged data)")
        mark("history")
        for y in (520, 700, 860):
            glide(page, 960, y); page.wait_for_timeout(2200)
        end("history")
        set_banner(page, "")
        mark("outro")
        glide(page, 960, 480); page.wait_for_timeout(3500)
        marks.append({"scene": "end", "t": round(time.time() - T0, 2)})

        vpath = page.video.path()
        ctx.close(); browser.close()
        raw = os.path.join(OUT, "raw_d1.webm")
        os.replace(vpath, raw)
        json.dump({"lead": round(lead, 2), "marks": marks}, open(os.path.join(OUT, "marks_d1.json"), "w"), indent=2)
        json.dump(run, open(os.path.join(OUT, "run_d1.json"), "w"), indent=2)
        print("saved", raw, flush=True)


if __name__ == "__main__":
    main()
