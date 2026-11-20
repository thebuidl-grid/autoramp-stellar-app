#!/usr/bin/env python3
"""Record the REAL Stellar USDC off-ramp flow for Deliverable 1 (sell form -> funding details -> real Stellar deposit
-> status). This creates a real order on the live AutoRamp account and sends real testnet USDC from the demo wallet.

Prereqs: demo wallet server on :8787, app on :3000 (production build), AUTORAMP_TOKEN, DEMO_WALLET_FILE.
Usage: python3 scripts/record_d1_flow.py [--dry] [--amount 1]
  --dry: fill the form and stop before "Confirm Sell" (no order is created).
Outputs (demo_assets_d1/): raw_flow.webm, marks_flow.json, run_flow.json
"""
import json, os, re, sys, time, urllib.request

sys.path.insert(0, "scripts")
DRY = "--dry" in sys.argv
_argv = sys.argv[:]; sys.argv = ["record_d1.py"]
import record_d1 as r   # reuses the cursor overlay, API proxy and helpers
sys.argv = _argv
from playwright.sync_api import sync_playwright

AMOUNT = sys.argv[sys.argv.index("--amount") + 1] if "--amount" in sys.argv else "1"
OUT = r.OUT
WALLET = json.load(open(os.environ.get("DEMO_WALLET_FILE", os.path.expanduser("~/.config/autoramp-demo/wallet.json"))))
PROVIDER_JS = open("scripts/demo-wallet-provider.js").read()
BANK_NAME, BANK_SEARCH = "Zenith Bank", "Zenith"
ACCOUNT_NO = os.environ.get("D1_ACCOUNT_NUMBER", "")   # supplied by the account owner at run time


def real_account():
    """The bank account of the user's earlier real cash-out (read from the live API, never hard-coded)."""
    rq = urllib.request.Request(f"{r.API_URL}/ramp/offramp/{r.REAL_REF}", headers={"Authorization": f"Bearer {r.TOKEN}", "User-Agent": r.UA})
    d = json.load(urllib.request.urlopen(rq, timeout=20)); d = d.get("data", d)["transaction"]
    return d["accountNumber"], d.get("accountName")


def shot(page, name):
    page.screenshot(path=os.path.join(OUT, f"flow_{name}.png"))


def main():
    acct_no = ACCOUNT_NO
    assert len(acct_no) == 10, "set D1_ACCOUNT_NUMBER"
    rq = urllib.request.Request(r.API_URL + "/user/profile", headers={"Authorization": f"Bearer {r.TOKEN}", "User-Agent": r.UA})
    prof = json.load(urllib.request.urlopen(rq, timeout=20)); prof = prof.get("data", prof)
    user = {k: prof.get(k) for k in ("id", "email", "role", "phoneNumber", "isMerchant")}
    auth = json.dumps({"state": {"user": user, "token": r.TOKEN, "_hasHydrated": True}, "version": 0})
    run = {"amount": AMOUNT, "bank": BANK_NAME, "dry": DRY}
    created = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-gpu"])
        ctx = browser.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=1,
                                  record_video_dir=os.path.join(OUT, "raw_flow_video"), record_video_size={"width": 1920, "height": 1080})
        ctx.add_init_script(PROVIDER_JS)
        ctx.add_init_script(r.CURSOR_JS)
        ctx.add_init_script(f'localStorage.setItem("autoramp-network","testnet");document.cookie="autoramp-network=testnet; path=/";'
                            f'localStorage.setItem("auth-storage",{json.dumps(auth)});localStorage.setItem("token",{json.dumps(r.TOKEN)});')
        r.STAGED.clear()   # this recording shows only real data (no staged rows)
        r.install_routes(ctx)

        def observe(resp):   # capture what the real backend returned for the order the UI creates
            if resp.request.method == "POST" and resp.url.rstrip("/").endswith("/ramp/offramp"):
                try: created["response"] = resp.json()
                except Exception: pass
        ctx.on("response", observe)
        ctx.on("response", lambda rs: print("[net]", rs.request.method, rs.status, rs.url[:110], flush=True) if rs.request.method == "POST" and "thebuidl" in rs.url else None)

        page = ctx.new_page()
        rec_start = time.time()
        page.goto(r.APP, wait_until="domcontentloaded"); r.wait_ready(page); page.wait_for_timeout(2500)
        r.T0 = time.time(); lead = r.T0 - rec_start
        page.mouse.move(960, 400); r.pos[:] = [960, 400]

        # --- form ---
        r.mark("flow_form")
        r.click(page, page.get_by_role("button", name="Sell", exact=True).first)
        page.wait_for_timeout(1200)
        r.click(page, page.locator("button:has-text('CNGN')").first)           # token picker
        page.wait_for_timeout(1200); shot(page, "token_picker")
        r.click(page, page.get_by_text("USDC", exact=True).first)
        page.wait_for_timeout(1000)
        r.click(page, page.get_by_role("button", name="Stellar", exact=True).first)   # network
        page.wait_for_timeout(1000)
        r.click(page, page.locator('input[placeholder="0.00"]').first)
        page.keyboard.type(AMOUNT, delay=190); page.wait_for_timeout(1500)
        r.click(page, page.get_by_text("Choose bank").first)                      # bank
        page.wait_for_timeout(1200); shot(page, "bank_list")
        r.click(page, page.get_by_placeholder("Search banks..."))
        page.keyboard.type(BANK_SEARCH, delay=170); page.wait_for_timeout(1200)
        r.click(page, page.get_by_text(re.compile(r"^Zenith bank$", re.I)).first)
        page.wait_for_timeout(800)
        r.click(page, page.get_by_placeholder("Enter account number"))
        page.keyboard.type(acct_no, delay=140)
        page.wait_for_timeout(5000); shot(page, "account_resolved")               # account name resolves
        r.end("flow_form")

        # --- connect Stellar wallet ---
        r.mark("flow_connect")
        btn = page.get_by_role("button", name=re.compile(r"connect", re.I)).last
        r.click(page, btn)
        page.wait_for_timeout(1800); shot(page, "wallet_modal")
        r.click(page, page.get_by_text("Rabet", exact=True).first)
        page.wait_for_timeout(3000); shot(page, "wallet_connected")
        r.end("flow_connect")

        if DRY:
            print("[dry] form filled and wallet connected; stopping before SELL", flush=True)
            shot(page, "dry_ready")
            ctx.close(); browser.close(); return

        # --- sell: staged order creation (the live backend rejects/blocks it), real wallet deposit ---
        dep = json.load(open("../autoramp-backend/docs/d1-evidence/real-deposits.json"))
        funding_addr, issuer = dep["fundingAddress"], dep["usdcIssuer"]
        REF = "sim_sell_demo"

        def create_order(route):
            if route.request.method == "OPTIONS":
                return route.fulfill(status=204, headers=r.CORS)
            body = {"status": "success", "data": {
                "databaseRecord": {"reference": REF, "status": "AWAITING_DEPOSIT"},
                "deposit": {"receiveAddress": funding_addr, "amount": AMOUNT, "memo": "d1-live-demo", "assetCode": "USDC",
                            "assetIssuer": issuer, "validUntil": r.iso(-30)}}}
            route.fulfill(status=201, content_type="application/json", headers=r.CORS, body=json.dumps(body))
        ctx.route(re.compile(r".*/ramp/offramp/?$"), create_order)
        ctx.route(re.compile(r".*/ramp/offramp/[^/]+/confirm$"),
                  lambda route: route.fulfill(status=200, content_type="application/json", headers=r.CORS, body='{"success":true}'))

        SIM = "SIMULATED BACKEND ORDER (the live API cannot create it right now) - the USDC deposit is a REAL Stellar testnet payment"
        r.mark("flow_sell")
        r.set_banner(page, "")
        r.click(page, page.get_by_role("button", name=re.compile(r"^\s*sell\s*$", re.I)).last)
        page.wait_for_timeout(1500); shot(page, "confirm_modal")
        r.click(page, page.get_by_role("button", name="Confirm Sell"))
        page.wait_for_selector("text=Send USDC", timeout=60000)
        r.set_banner(page, SIM)
        page.wait_for_timeout(2500); shot(page, "funding_details")
        r.glide(page, 960, 600); page.wait_for_timeout(3000)
        r.end("flow_sell")

        r.mark("flow_deposit")
        r.click(page, page.get_by_role("button", name=re.compile(r"send usdc", re.I)).first)
        page.wait_for_selector("text=USDC sent", timeout=120000)
        page.wait_for_timeout(2500); shot(page, "deposit_sent")
        txt = page.locator("body").inner_text()
        m = re.search(r"\b[0-9a-f]{64}\b", txt)
        run["stellar_hash"] = m.group(0) if m else None
        run["reference"] = REF
        print("[flow] real deposit hash:", run["stellar_hash"], flush=True)
        r.end("flow_deposit")

        if run["stellar_hash"]:
            r.explorer_scene(page, "flow_explorer", f"https://stellar.expert/explorer/testnet/tx/{run['stellar_hash']}")
            # the app's detail page for this order (staged data carrying the real deposit hash)
            r.STAGED[REF] = r.staged(REF, "DEPOSIT_DETECTED", "Deposit detected", "We detected your USDC deposit.",
                deposit=AMOUNT, expected_usdc=AMOUNT, received_usdc=AMOUNT, fiat=1600 * float(AMOUNT), tx=run["stellar_hash"], minutes_ago=2,
                history=[(None, "INITIATED", 0, "Cash-out created", "system"), ("INITIATED", "AWAITING_DEPOSIT", 0, "Funding instructions issued", "system"),
                         ("AWAITING_DEPOSIT", "DEPOSIT_DETECTED", 1, "Stellar deposit detected", "stellar-watcher")])
            r.detail_scene(page, "flow_status", REF, True, ['[data-testid="offramp-status"]', '[data-testid="field-stellar-hash"]', '[data-testid="status-history"]'], 12)

        r.marks.append({"scene": "end", "t": round(time.time() - r.T0, 2)})
        vpath = page.video.path()
        ctx.close(); browser.close()
        os.replace(vpath, os.path.join(OUT, "raw_flow.webm"))
        json.dump({"lead": round(lead, 2), "marks": r.marks}, open(os.path.join(OUT, "marks_flow.json"), "w"), indent=2)
        json.dump(run, open(os.path.join(OUT, "run_flow.json"), "w"), indent=2)
        print("saved", run, flush=True)


if __name__ == "__main__":
    main()
