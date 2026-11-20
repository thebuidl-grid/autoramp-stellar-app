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

SCRIPTS_D2 = [
    (21, "Now the off-ramp process itself, in the real application. I open Sell, choose USDC, and the Stellar network. I enter one USDC, "
         "then pick Zenith Bank and type the account number. The app looks up and shows the account name before it lets me continue."),
    (22, "Next I connect a Stellar wallet. This is a real testnet wallet that holds testnet USDC."),
    (23, "I confirm the sale. One caveat: the live backend could not create this order today. Its exchange-rate service is failing, and its minimum-amount rule expects a naira amount. "
         "So the order response here is simulated, and the banner says so. The funding details are rendered by the real interface."),
    (24, "Now I click Send USDC from wallet. The wallet signs a real Stellar testnet payment of one USDC to the funding address."),
    (25, "Here is that payment on Stellar Expert: a successful payment of one USDC, with the memo d1 live demo."),
    (26, "Finally, the transaction detail page for this cash-out. It is staged data, and it is labelled as simulated, but it carries the real deposit hash. "
         "It shows Deposit detected, with the amounts and the status history."),
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

    with open(os.path.join(OUTPUT_DIR, "scene_durations_flow.json"), "w") as jf:
        json.dump(durations, jf, indent=2)


if __name__ == "__main__":
    main()
