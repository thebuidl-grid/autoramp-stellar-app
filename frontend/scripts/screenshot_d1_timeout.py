#!/usr/bin/env python3
"""One image of the simulated timed-out (EXPIRED) off-ramp transfer for Deliverable 1.
The data is staged (clearly labelled SIMULATED on the image); the page is the real detail view.
Usage: APP_URL=http://localhost:3000 python3 scripts/screenshot_d1_timeout.py [out.png]"""
import json, os, sys
os.environ.setdefault("AUTORAMP_TOKEN", "screenshot-only-token")   # never contacts the live account
out = sys.argv[1] if len(sys.argv) > 1 else "demo_assets_d1/sim_timeout_transfer.png"
sys.path.insert(0, "scripts"); _argv = sys.argv[:]; sys.argv = ["record_d1.py"]
import record_d1 as r
sys.argv = _argv
from playwright.sync_api import sync_playwright

REF = "sim_timeout_demo"
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-gpu"])
    ctx = browser.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    auth = json.dumps({"state": {"user": {"id": "demo", "email": "demo@example.com", "role": "USER"}, "token": r.TOKEN, "_hasHydrated": True}, "version": 0})
    ctx.add_init_script(f'localStorage.setItem("autoramp-network","testnet");document.cookie="autoramp-network=testnet; path=/";'
                        f'localStorage.setItem("auth-storage",{json.dumps(auth)});localStorage.setItem("token",{json.dumps(r.TOKEN)});')
    r.install_routes(ctx)
    page = ctx.new_page()
    r.goto(page, f"/history/{REF}", '[data-testid="offramp-detail"]')
    r.set_banner(page, "SIMULATED TIMEOUT — staged data in the real UI (not a live transaction)")
    page.wait_for_timeout(800)
    page.screenshot(path=out, full_page=True)
    print("saved", out)
    browser.close()
