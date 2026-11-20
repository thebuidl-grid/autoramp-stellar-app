import os
import json
import time
import subprocess
from playwright.sync_api import sync_playwright

OUTPUT_DIR = "demo_assets"
VIDEO_RAW_DIR = os.path.join(OUTPUT_DIR, "raw_video")
os.makedirs(VIDEO_RAW_DIR, exist_ok=True)

with open(os.path.join(OUTPUT_DIR, "scene_durations.json")) as f:
    durations = json.load(f)

# Scene target timings based on ElevenLabs narration clip lengths
# (adding a small breathing room so the voiceover transitions naturally)
d1 = durations.get("1", 20.3) + 1.2
d2 = durations.get("2", 19.0) + 1.2
d3 = durations.get("3", 19.6) + 1.2
d4 = durations.get("4", 18.8) + 1.2
d5 = durations.get("5", 16.8) + 1.8

print(f"Target timings: S1={d1:.1f}s, S2={d2:.1f}s, S3={d3:.1f}s, S4={d4:.1f}s, S5={d5:.1f}s")
print(f"Total target video runtime: {d1 + d2 + d3 + d4 + d5:.1f}s ({(d1+d2+d3+d4+d5)/60:.2f} mins)")

auth_data = json.dumps({
    "state": {
        "user": {
            "id": "d88b9a65-849f-4a74-bc3e-05f7b7e9c890",
            "email": "andrewdvd10@gmail.com",
            "role": "USER",
            "phoneNumber": "+2349167582901",
            "isMerchant": False
        },
        "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkODhiOWE2NS04NDlmLTRhNzQtYmMzZS0wNWY3YjdlOWM4OTAiLCJlbWFpbCI6ImFuZHJld2R2ZDEwQGdtYWlsLmNvbSIsInJvbGUiOiJVU0VSIiwiaWF0IjoxNzkzNTgyMDE0LCJleHAiOjE3OTM2Njg0MTR9.tXF4ELGCL0lHsrLTV22OJc5hR9Zl4Cd-CgcBNS1wVnM",
        "_hasHydrated": True
    },
    "version": 0
})
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkODhiOWE2NS04NDlmLTRhNzQtYmMzZS0wNWY3YjdlOWM4OTAiLCJlbWFpbCI6ImFuZHJld2R2ZDEwQGdtYWlsLmNvbSIsInJvbGUiOiJVU0VSIiwiaWF0IjoxNzkzNTgyMDE0LCJleHAiOjE3OTM2Njg0MTR9.tXF4ELGCL0lHsrLTV22OJc5hR9Zl4Cd-CgcBNS1wVnM"
stellar_addr = "GBWVMG6RAF74V2HFEXZQ6GQDQMT46CJLHESPJJGR4H53TVG3TYXAAS5F"
stellar_tx_hash = "db2b46e83dcade2e1be63bce99eb2a7f9f0f2b43102a6821d7b8b0ad35cc837c"
dest_funding = "GA2UT7VBKIU2MHL3PUQVCJ5Y5EAOLZGXED5BFZP62VNWBNG6N7Z52MJI"
usdc_issuer = "GAWG4HZAXIJEFSGKM7WIZLZIGL44Z6OCMNBHTQ3DGA3JBH2EGL2HTWTU"

tx_history_data = {
    "onramp": [],
    "offramp": [
        {
            "id": "off_tx_stellar_01",
            "reference": "off_stellar_real_proof",
            "amount": 5000,
            "status": "COMPLETED",
            "network": "stellar",
            "bankCode": "044",
            "bankName": "Access Bank",
            "accountNumber": "0690000031",
            "accountName": "ANDREW DAVID",
            "createdAt": "2026-11-02T04:45:00.000Z",
            "completedAt": "2026-11-02T04:47:15.000Z",
            "providerOrder": {
                "depositAddress": dest_funding,
                "depositTxHash": stellar_tx_hash,
                "expectedAmount": "3.125000",
                "receivedAmount": "3.125000",
                "failureReason": None
            }
        },
        {
            "id": "off_tx_stellar_02",
            "reference": "off_stellar_expired_proof",
            "amount": 3500,
            "status": "EXPIRED",
            "network": "stellar",
            "bankCode": "044",
            "bankName": "Access Bank",
            "accountNumber": "0690000031",
            "accountName": "ANDREW DAVID",
            "createdAt": "2026-11-02T02:00:00.000Z",
            "completedAt": None,
            "providerOrder": {
                "depositAddress": dest_funding,
                "depositTxHash": None,
                "expectedAmount": "2.180000",
                "receivedAmount": None,
                "failureReason": "timeout"
            }
        },
        {
            "id": "off_tx_stellar_03",
            "reference": "off_stellar_partial_proof",
            "amount": 8000,
            "status": "PARTIAL",
            "network": "stellar",
            "bankCode": "044",
            "bankName": "Access Bank",
            "accountNumber": "0690000031",
            "accountName": "ANDREW DAVID",
            "createdAt": "2026-11-01T22:30:00.000Z",
            "completedAt": None,
            "providerOrder": {
                "depositAddress": dest_funding,
                "depositTxHash": "7a9f96500a059c6c12818d0178e2c4592799e8c899ef0e251f2460170989e120",
                "expectedAmount": "5.000000",
                "receivedAmount": "2.500000",
                "failureReason": "partial_settlement"
            }
        }
    ],
    "swap": [],
    "total": 3,
    "page": 1,
    "limit": 10,
    "totalPages": 1
}

def smooth_mouse_move(page, start_x, start_y, end_x, end_y, steps=25, delay=0.015):
    for i in range(1, steps + 1):
        x = start_x + (end_x - start_x) * (i / steps)
        y = start_y + (end_y - start_y) * (i / steps)
        page.mouse.move(x, y)
        time.sleep(delay)

def record():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
        )
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1,
            record_video_dir=VIDEO_RAW_DIR,
            record_video_size={"width": 1920, "height": 1080}
        )
        page = context.new_page()

        # Mock API routes for deterministic, flawless demo execution
        page.route("**/misc/resolve-account*", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"status": "success", "data": {"accountName": "ANDREW DAVID"}})
        ))

        page.route("**/ramp/offramp", lambda route: route.fulfill(
            status=201,
            content_type="application/json",
            body=json.dumps({
                "status": "success",
                "message": "Offramp initialized",
                "data": {
                    "databaseRecord": {
                        "id": "off_stellar_01_rec",
                        "reference": "off_stellar_real_proof",
                        "status": "PENDING"
                    },
                    "deposit": {
                        "receiveAddress": dest_funding,
                        "amount": "3.125000",
                        "memo": "839201",
                        "assetCode": "USDC",
                        "assetIssuer": usdc_issuer,
                        "validUntil": "2026-11-02T13:00:00Z"
                    }
                }
            })
        ))

        page.route("**/ramp/offramp/**/confirm", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"status": "success", "message": "Deposit confirmed"})
        ))

        page.route("**/ramp/transactions*", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(tx_history_data)
        ))

        # ---------------------------------------------------------
        # SCENE 1: Homepage & Introduction (Target: ~21.5s)
        # ---------------------------------------------------------
        print("[Scene 1] Recording Introduction...")
        s1_start = time.time()
        page.goto("http://localhost:3000")
        page.evaluate(f'''() => {{
            localStorage.setItem("auth-storage", {repr(auth_data)});
            localStorage.setItem("token", {repr(token)});
            localStorage.setItem("stellar-wallet-address", {repr(stellar_addr)});
            localStorage.setItem("mock-stellar-tx-hash", {repr(stellar_tx_hash)});
        }}''')
        page.reload()
        page.wait_for_timeout(2000)

        # Smooth mouse tour over the AutoRamp hero section
        smooth_mouse_move(page, 960, 540, 500, 220, steps=25)
        time.sleep(2.5)
        smooth_mouse_move(page, 500, 220, 1150, 380, steps=30)
        time.sleep(2.5)
        smooth_mouse_move(page, 1150, 380, 960, 480, steps=25)

        remaining_s1 = max(0, d1 - (time.time() - s1_start))
        time.sleep(remaining_s1)
        print(f"[Scene 1] Done in {time.time() - s1_start:.2f}s")

        # ---------------------------------------------------------
        # SCENE 2: Sell Tab, Stellar Network, Bank Selection (~20.2s)
        # ---------------------------------------------------------
        print("[Scene 2] Recording Sell tab & Stellar configuration...")
        s2_start = time.time()

        # 1. Click Sell tab
        sell_tab = page.locator('button:has-text("Sell")').first
        box = sell_tab.bounding_box()
        if box:
            smooth_mouse_move(page, 960, 480, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=20)
            sell_tab.click()
        page.wait_for_timeout(800)

        # 2. Select USDC in token selector modal
        token_selector = page.locator('button:has-text("CNGN")').first
        box = token_selector.bounding_box()
        if box:
            smooth_mouse_move(page, box["x"], box["y"], box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=15)
            token_selector.click()
        page.wait_for_timeout(600)
        usdc_option = page.locator('[role="dialog"] button:has-text("USDC"), button:has-text("USDC")').first
        box = usdc_option.bounding_box()
        if box:
            smooth_mouse_move(page, 960, 500, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=15)
            usdc_option.click()
        page.wait_for_timeout(800)

        # 3. Click Stellar network pill
        stellar_pill = page.locator('button:has-text("Stellar")').first
        box = stellar_pill.bounding_box()
        if box:
            smooth_mouse_move(page, 960, 500, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=20)
            stellar_pill.click()
        page.wait_for_timeout(1000)

        # 4. Type sell amount (5000 NGN)
        amount_input = page.locator('input[placeholder="0.00"]').first
        box = amount_input.bounding_box()
        if box:
            smooth_mouse_move(page, 960, 500, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=15)
            amount_input.click()
            amount_input.fill("5000")
        page.wait_for_timeout(800)

        # 5. Choose Destination Bank (Access bank)
        bank_btn = page.locator('button:has-text("Choose bank")').first
        if bank_btn.count() > 0:
            box = bank_btn.bounding_box()
            if box:
                smooth_mouse_move(page, 960, 500, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=15)
                bank_btn.click()
                page.wait_for_timeout(600)
                # Search Access in the bank dialog
                search_input = page.locator('[role="dialog"] input[placeholder="Search banks..."]')
                if search_input.count() > 0:
                    search_input.fill("ACCESS")
                    page.wait_for_timeout(500)
                access_btn = page.locator('[role="dialog"] button:has-text("Access")').first
                if access_btn.count() > 0:
                    box_acc = access_btn.bounding_box()
                    if box_acc:
                        smooth_mouse_move(page, 960, 500, box_acc["x"] + box_acc["width"]/2, box_acc["y"] + box_acc["height"]/2, steps=12)
                    access_btn.click()
        page.wait_for_timeout(800)

        # 6. Type Account Number and observe auto-resolution
        acc_input = page.locator('input[placeholder="Enter account number"]').first
        if acc_input.count() > 0:
            box = acc_input.bounding_box()
            if box:
                smooth_mouse_move(page, 960, 500, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=15)
                acc_input.click()
                acc_input.fill("0690000031")
        page.wait_for_timeout(2000)

        remaining_s2 = max(0, d2 - (time.time() - s2_start))
        time.sleep(remaining_s2)
        print(f"[Scene 2] Done in {time.time() - s2_start:.2f}s")

        # ---------------------------------------------------------
        # SCENE 3: Submit Off-Ramp & Stellar Wallet Signing (~20.8s)
        # ---------------------------------------------------------
        print("[Scene 3] Recording Off-ramp submission & on-chain funding...")
        s3_start = time.time()

        # Click SELL button
        sell_action_btn = page.locator('form button[type="submit"]').first
        box = sell_action_btn.bounding_box()
        if box:
            smooth_mouse_move(page, 960, 600, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=20)
        sell_action_btn.click(force=True)
        page.wait_for_timeout(1000)

        # Click Confirm Sell in confirmation modal
        confirm_btn = page.locator('button:has-text("Confirm Sell")').first
        if confirm_btn.count() > 0:
            box = confirm_btn.bounding_box()
            if box:
                smooth_mouse_move(page, 960, 500, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=15)
            confirm_btn.click(force=True)
        page.wait_for_timeout(2000)

        # Highlight deposit instructions
        smooth_mouse_move(page, 960, 500, 960, 430, steps=20)
        time.sleep(2.0)

        # Click "Send USDC from wallet"
        send_wallet_btn = page.locator('button:has-text("Send USDC from wallet")').first
        if send_wallet_btn.count() > 0:
            box = send_wallet_btn.bounding_box()
            if box:
                smooth_mouse_move(page, 960, 430, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=15)
            send_wallet_btn.click(force=True)
        page.wait_for_timeout(2500)

        # Move mouse over the confirmed Tx hash
        smooth_mouse_move(page, 960, 500, 960, 680, steps=20)
        page.wait_for_timeout(2500)

        remaining_s3 = max(0, d3 - (time.time() - s3_start))
        time.sleep(remaining_s3)
        print(f"[Scene 3] Done in {time.time() - s3_start:.2f}s")

        # ---------------------------------------------------------
        # SCENE 4: History & On-Chain Proof Verification (~20.0s)
        # ---------------------------------------------------------
        print("[Scene 4] Recording History & on-chain proof...")
        s4_start = time.time()

        # Navigate to History via header link
        history_link = page.locator('nav a[href="/history"], a:has-text("History")').first
        box = history_link.bounding_box()
        if box:
            smooth_mouse_move(page, 960, 680, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=25)
            history_link.click()
        else:
            page.goto("http://localhost:3000/history")
        page.wait_for_timeout(2500)

        # Expand the first off-ramp transaction accordion (off_stellar_real_proof)
        first_tx = page.locator('text=off_stellar_real_proof').first
        if first_tx.count() > 0:
            box = first_tx.bounding_box()
            if box:
                smooth_mouse_move(page, 960, 300, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=15)
            first_tx.click()
        page.wait_for_timeout(1800)

        # Click on the Stellar Tx Hash link to actually open and show the live Stellar Expert Explorer!
        explorer_link = page.locator('a[href*="stellar.expert"]').first
        if explorer_link.count() > 0:
            box = explorer_link.bounding_box()
            if box:
                smooth_mouse_move(page, 960, 450, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=15)
            page.wait_for_timeout(800)
            print("[Scene 4] Navigating to Stellar Expert Explorer on-screen...")
            page.goto(f"https://stellar.expert/explorer/testnet/tx/{stellar_tx_hash}")
            page.wait_for_timeout(4500)
            # Return smoothly to history page
            page.goto("http://localhost:3000/history")
            page.wait_for_timeout(1800)
            first_tx = page.locator('text=off_stellar_real_proof').first
            if first_tx.count() > 0:
                first_tx.click()
            page.wait_for_timeout(1200)

        remaining_s4 = max(0, d4 - (time.time() - s4_start))
        time.sleep(remaining_s4)
        print(f"[Scene 4] Done in {time.time() - s4_start:.2f}s")

        # ---------------------------------------------------------
        # SCENE 5: Failure Scenarios (Expired / Partial) & Outro (~18.6s)
        # ---------------------------------------------------------
        print("[Scene 5] Recording Failure recovery & Outro...")
        s5_start = time.time()

        # Scroll down slightly to showcase the Expired and Partial off-ramps
        page.mouse.wheel(0, 180)
        page.wait_for_timeout(1000)

        # Expand the second (Expired) item
        expired_tx = page.locator('text=off_stellar_expired_proof').first
        if expired_tx.count() > 0:
            box = expired_tx.bounding_box()
            if box:
                smooth_mouse_move(page, 960, 450, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=20)
            expired_tx.click()
        page.wait_for_timeout(2000)

        # Expand the third (Partial) item
        partial_tx = page.locator('text=off_stellar_partial_proof').first
        if partial_tx.count() > 0:
            box = partial_tx.bounding_box()
            if box:
                smooth_mouse_move(page, 960, 550, box["x"] + box["width"]/2, box["y"] + box["height"]/2, steps=20)
            partial_tx.click()
        page.wait_for_timeout(2000)

        # Scroll down smoothly to show full reconciliation and failure reason
        page.mouse.wheel(0, 200)
        page.wait_for_timeout(2000)

        remaining_s5 = max(0, d5 - (time.time() - s5_start))
        time.sleep(remaining_s5)
        print(f"[Scene 5] Done in {time.time() - s5_start:.2f}s")

        video_path = page.video.path()
        page.close()
        context.close()
        browser.close()

        target_raw = os.path.join(OUTPUT_DIR, "raw_demo.webm")
        if os.path.exists(video_path):
            os.replace(video_path, target_raw)
            print(f"Final raw video saved to: {target_raw}")
            return target_raw
        return video_path

def stitch_video():
    print("Stitching full audio narration...")
    # Calculate exact delays in ms for each scene:
    # Scene 0 starts at 0.5s (500ms)
    t0 = 500
    t1 = int((d1) * 1000)
    t2 = int((d1 + d2) * 1000)
    t3 = int((d1 + d2 + d3) * 1000)
    t4 = int((d1 + d2 + d3 + d4) * 1000)

    audio_cmd = [
        "ffmpeg", "-y",
        "-i", "demo_assets/scene_1.mp3",
        "-i", "demo_assets/scene_2.mp3",
        "-i", "demo_assets/scene_3.mp3",
        "-i", "demo_assets/scene_4.mp3",
        "-i", "demo_assets/scene_5.mp3",
        "-filter_complex",
        f"[0:a]adelay={t0}|{t0}[a0]; "
        f"[1:a]adelay={t1}|{t1}[a1]; "
        f"[2:a]adelay={t2}|{t2}[a2]; "
        f"[3:a]adelay={t3}|{t3}[a3]; "
        f"[4:a]adelay={t4}|{t4}[a4]; "
        f"[a0][a1][a2][a3][a4]amix=inputs=5:dropout_transition=0:normalize=0[aout]",
        "-map", "[aout]",
        "demo_assets/full_narration.mp3"
    ]
    subprocess.run(audio_cmd, check=True)
    print("Full narration generated: demo_assets/full_narration.mp3")

    print("Muxing video with audio into final demo mp4...")
    final_mp4 = "docs/autoramp_stellar_offramp_demo.mp4"
    mux_cmd = [
        "ffmpeg", "-y",
        "-i", "demo_assets/raw_demo.webm",
        "-i", "demo_assets/full_narration.mp3",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        final_mp4
    ]
    subprocess.run(mux_cmd, check=True)
    print(f"Final polished demo video generated: {final_mp4} ({os.path.getsize(final_mp4)} bytes)")

    print("Extracting scene thumbnails for visual validation...")
    thumbs = [
        (1, 10, "demo_assets/thumb_scene1.png"),
        (2, int(d1 + 10), "demo_assets/thumb_scene2.png"),
        (3, int(d1 + d2 + 10), "demo_assets/thumb_scene3.png"),
        (4, int(d1 + d2 + d3 + 4), "demo_assets/thumb_scene4.png"),
        ("4_explorer", 102, "demo_assets/thumb_explorer.png"),
        (5, int(d1 + d2 + d3 + d4 + 8), "demo_assets/thumb_scene5.png"),
    ]
    for sc, sec, path in thumbs:
        subprocess.run([
            "ffmpeg", "-y", "-ss", str(sec),
            "-i", final_mp4,
            "-frames:v", "1", "-update", "1",
            path
        ], check=True)
        print(f"Scene {sc} thumbnail saved: {path}")

if __name__ == "__main__":
    record()
    stitch_video()
