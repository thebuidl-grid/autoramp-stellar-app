import sys
import os
import json
import subprocess
import urllib.request
import urllib.error
import time

import re

# TTS provider: "edge" (free Microsoft Nigerian-English neural voices, no key) or "elevenlabs".
PROVIDER = os.getenv("TTS_PROVIDER", "edge")
EDGE_VOICE = os.getenv("EDGE_VOICE", "en-NG-AbeoNeural")   # male; female: en-NG-EzinneNeural
EDGE_RATE = os.getenv("EDGE_RATE", "-4%")
EDGE_BIN = os.getenv("EDGE_TTS_BIN", os.path.expanduser("~/.config/autoramp-demo/venv/bin/edge-tts"))

# ElevenLabs config (only used when TTS_PROVIDER=elevenlabs)
API_KEY = os.environ.get("ELEVENLABS_API_KEY")
if PROVIDER == "elevenlabs" and not API_KEY:
    sys.exit("Set ELEVENLABS_API_KEY in the environment (never hardcode it).")
VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "dV8g2WdecMoknIKiRdV2")
MODEL_ID = os.getenv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
OUTPUT_DIR = "demo_assets_d1"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Voiceover for the Deliverable 1 walkthrough (hardened Stellar USDC off-ramp).
# Scenes 4-9 show STAGED provider outcomes and the narration says so every time.
SCRIPTS_D2 = [
    (1, "Hello, this is a demonstration of Deliverable 1 of the AutoRamp Stellar Community Fund Instaward: hardening the Stellar USDC off-ramp and its transaction state management. "
        "This is the real application, showing the transaction history for a real account. "
        "First I will show a real completed cash-out, and then the failure cases: timeout, partial settlement, a rejected payout, a reversal, and insufficient liquidity. "
        "The failure cases are simulated, and I will label each one clearly."),
    (2, "This is a real off-ramp from this account, loaded live from the AutoRamp API. "
        "Its status is Completed. The page shows the source asset, the deposit amount, the expected and actual payout in naira, and the conversion rate. "
        "It also shows the Stellar transaction hash of the deposit, and the full status history with a timestamp for every step."),
    (3, "Opening that hash on Stellar Expert, the deposit is a real, successful payment on the Stellar test network. This earlier proof transaction was a native lumens payment; the USDC deposits you will see next are real USDC."),
    (4, "Now the failure cases. The banner at the top says this is a simulated provider outcome: the data is staged, but it is rendered by the real interface. "
        "In this one, the cash-out expired. The deposit never arrived within the funding window, so the state is Expired. "
        "It is clearly marked as not paid out, it shows the reason, the state it was in, and the time window, and it tells the user to contact support with the reference."),
    (5, "Simulated again: a partial settlement. Five USDC were expected, but only two and a half were received. "
        "The settlement panel shows the expected, received, and outstanding amounts, so nothing is hidden, and the status is Partially Settled rather than Completed. "
        "The deposit hash here is a real testnet payment of two and a half USDC."),
    (6, "Here it is on Stellar Expert: a real payment of two point five USDC, with the memo d1 partial."),
    (7, "Simulated: a rejected payout. The deposit was real, but the payout provider rejected the payout. "
        "The status is Payout Rejected, it is marked as not paid out, and the provider's code and message are shown, along with the original deposit hash."),
    (8, "Simulated: a reversal. This payout completed, and was then reversed. "
        "The reversal is linked to the transaction, with the amount, the reason, and the state it was in before the reversal, and the history shows Completed followed by Reversed."),
    (9, "Simulated: insufficient liquidity. The payout was held because there was not enough liquidity. "
        "The page shows the required amount, the available amount, and the shortfall, and tells the user the transaction is on hold and can be retried."),
    (10, "Transaction state is stored by the backend, not in the browser. I reload the real transaction, and the same status, amounts, and history load again. "
         "The same is true after logging out and back in."),
    (11, "Back on the history page, the real transaction is listed together with the five staged outcomes, each with its own status label."),
    (12, "To summarise: thirteen explicit states with enforced transitions, timeout handling, partial settlement, rejected payouts, reversals, and insufficient liquidity, "
         "all visible to the user with a clear explanation. The real cash-out and the Stellar deposits are verifiable on chain, and the failure scenarios were simulated and labelled as such. Thank you for watching."),
]


def strip_breaks(text):
    """ElevenLabs pause tags are read aloud by Edge; the sentence punctuation already gives the pauses."""
    return re.sub(r"\s*<break[^>]*/>\s*", " ", text).strip()


def generate_edge(scene_num, text, out_file):
    txt = os.path.join(OUTPUT_DIR, f"scene_{scene_num}.txt")
    open(txt, "w").write(strip_breaks(text))
    print(f"Generating Edge TTS for Scene {scene_num} ({EDGE_VOICE}, {len(text)} chars)...")
    r = subprocess.run([EDGE_BIN, "--voice", EDGE_VOICE, f"--rate={EDGE_RATE}", "--file", txt, "--write-media", out_file],
                       capture_output=True, text=True)
    if r.returncode or not os.path.exists(out_file) or os.path.getsize(out_file) < 1000:
        raise RuntimeError(f"edge-tts failed for scene {scene_num}: {r.stderr[-300:]}")
    return out_file


def generate_tts(scene_num, text, force=False):
    out_file = os.path.join(OUTPUT_DIR, f"scene_{scene_num}.mp3")
    if not force and os.path.exists(out_file) and os.path.getsize(out_file) > 1000:
        print(
            f"Scene {scene_num} audio already exists ({os.path.getsize(out_file)} bytes), skipping generation."
        )
        return out_file

    if PROVIDER == "edge":
        return generate_edge(scene_num, text, out_file)

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    headers = {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": MODEL_ID,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
        },
    }
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST"
    )
    last_err = None
    for attempt in range(3):
        try:
            print(
                f"Generating TTS for Scene {scene_num} using model {MODEL_ID}, voice {VOICE_ID} ({len(text)} chars, attempt {attempt+1})..."
            )
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = resp.read()
                with open(out_file, "wb") as f:
                    f.write(data)
                print(f"Saved Scene {scene_num} audio to {out_file} ({len(data)} bytes)")
                return out_file
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, Exception) as e:
            last_err = e
            if isinstance(e, urllib.error.HTTPError):
                try:
                    body = e.read().decode("utf-8", "replace")
                    print(f"Attempt {attempt+1} failed for Scene {scene_num}: HTTP {e.code} {body}")
                except Exception:
                    print(f"Attempt {attempt+1} failed for Scene {scene_num}: {e}")
            else:
                print(f"Attempt {attempt+1} failed for Scene {scene_num}: {e}")
            if attempt < 2:
                time.sleep(3)
    if last_err:
        raise last_err


def get_duration(audio_file):
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        audio_file,
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, text=True, check=True)
    return float(res.stdout.strip())


def main():
    force_all = "--force" in sys.argv
    durations = {}
    total_chars = sum(len(text) for _, text in SCRIPTS_D2)
    print(f"Total script characters across all {len(SCRIPTS_D2)} scenes: {total_chars}")

    for scene_num, text in SCRIPTS_D2:
        force = force_all or f"--force-scene-{scene_num}" in sys.argv
        f = generate_tts(scene_num, text, force=force)
        dur = get_duration(f)
        durations[str(scene_num)] = dur
        print(f"Scene {scene_num} duration: {dur:.2f} seconds")

    total_duration = sum(durations.values())
    print(
        f"Total narration duration: {total_duration:.2f} seconds ({total_duration/60:.2f} minutes)"
    )

    with open(os.path.join(OUTPUT_DIR, "scene_durations.json"), "w") as jf:
        json.dump(durations, jf, indent=2)


if __name__ == "__main__":
    main()
