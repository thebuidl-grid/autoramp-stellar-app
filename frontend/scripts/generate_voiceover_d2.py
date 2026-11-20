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
OUTPUT_DIR = "demo_assets_d2"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Voiceover aligned to docs/DEMO_D2_RECORDING_SCRIPT.md (Deliverable 2, show-only demo)
# Scenes 1-8: video 1 (Base Sepolia -> Stellar, the D2 deliverable).  Scenes 9-16: video 2 (Stellar -> Base, return trip).
SCRIPTS_D2 = [
    (1, "Hello, this is a demonstration of Deliverable 2 of the AutoRamp Stellar Community Fund Instaward. <break time=\"0.6s\" /> "
        "The goal is to let users deposit USDC from a blockchain other than Stellar into AutoRamp's Stellar-based off-ramp. <break time=\"0.6s\" /> "
        "In this demo, the source network is Base, on its Sepolia testnet, and the destination network is Stellar testnet. <break time=\"0.6s\" /> "
        "Everything you will see on chain is a real testnet transaction, and every click and keystroke happens in the real application."),
    (2, "I open the Bridge tab and click Connect Wallet. <break time=\"0.5s\" /> "
        "The wallet connects through the standard wallet picker, <break time=\"0.3s\" /> and the app shows the connected address on the Base Sepolia network, "
        "along with the available USDC balance."),
    (3, "The source network is Base Sepolia, <break time=\"0.3s\" /> and the destination is Stellar Testnet. <break time=\"0.5s\" /> "
        "I type an amount of two USDC, <break time=\"0.3s\" /> and enter the destination: a Stellar account that already has a USDC trustline."),
    (4, "Now I click Bridge. <break time=\"0.5s\" /> "
        "The wallet signs two transactions. <break time=\"0.4s\" /> First, it approves Circle's token messenger to spend the USDC. <break time=\"0.4s\" /> "
        "Second, it burns the USDC on Base, with Circle's forwarder contract set as the recipient on Stellar, and my Stellar account encoded in the message. <break time=\"0.6s\" /> "
        "As soon as the burn is confirmed, the source transaction hash appears in the status card, and AutoRamp starts tracking it. <break time=\"0.6s\" /> "
        "Next, Circle's attestation service signs the burn once the Base block has enough confirmations. <break time=\"0.5s\" /> "
        "Then a relayer submits the mint-and-forward call on Stellar, <break time=\"0.3s\" /> and the USDC is created directly in the destination account. <break time=\"0.6s\" /> "
        "This takes about two minutes, and everything you are seeing is live. <break time=\"0.8s\" /> Nothing is skipped or sped up while we wait."),
    (5, "This is the source transaction on a Base Sepolia block explorer. <break time=\"0.5s\" /> "
        "The status is success, <break time=\"0.3s\" /> the method is deposit for burn with hook, <break time=\"0.3s\" /> and two USDC were burned. <break time=\"0.6s\" /> "
        "This is independent proof of the funds leaving Base."),
    (6, "And this is the destination transaction on Stellar Expert: <break time=\"0.4s\" /> successful, <break time=\"0.3s\" /> and it called mint and forward on Circle's forwarder, which credited the USDC to the destination account. <break time=\"0.5s\" /> "
        "Together, these two transactions prove the cross-chain movement."),
    (7, "In the transaction history tab, the transfer appears at the top, listed as a Bridge, <break time=\"0.3s\" /> from Base Sepolia to Stellar Testnet, with a completed status. <break time=\"0.5s\" /> "
        "Expanding it shows the amount, the protocol, and both transaction hashes, linked to their block explorers. <break time=\"0.6s\" /> "
        "This is the live AutoRamp API, so older entries from the same account are listed below."),
    (8, "This completes the demonstration of Deliverable 2: <break time=\"0.4s\" /> "
        "a real USDC transfer from Base to Stellar, started from AutoRamp's interface, <break time=\"0.3s\" /> "
        "with verifiable transactions on both chains. Thank you for watching."),
    (9, "Now for the return trip: sending USDC from Stellar back to Base. <break time=\"0.5s\" /> "
        "I start on the same Bridge tab, with the route from the previous transfer still showing."),
    (10, "Because this transfer ends on Base, the Base wallet connects first: <break time=\"0.3s\" /> it will receive the USDC and sign the final mint. <break time=\"0.6s\" /> "
         "Then, because the transfer starts on Stellar, I click Connect Stellar. <break time=\"0.5s\" /> The app uses the Stellar Wallets Kit, which lists the supported Stellar wallets, <break time=\"0.3s\" /> and I choose Rabet. <break time=\"0.6s\" /> "
         "Both wallets are now connected."),
    (11, "I use the swap button to flip the route, <break time=\"0.3s\" /> so the source is now Stellar Testnet and the destination is Base Sepolia. <break time=\"0.5s\" /> "
         "I enter one USDC, <break time=\"0.3s\" /> and the destination address on Base."),
    (12, "I click Bridge. <break time=\"0.5s\" /> "
         "This time the Stellar wallet signs two Soroban transactions: <break time=\"0.3s\" /> an approval for Circle's token messenger, and then the burn. <break time=\"0.6s\" /> "
         "Once the burn is confirmed, its hash appears in the status card. <break time=\"0.5s\" /> "
         "The card tracks three stages: <break time=\"0.3s\" /> the bridge is initiated, Circle attests to the burn, <break time=\"0.3s\" /> and the Base wallet submits the mint, <break time=\"0.3s\" /> which delivers the USDC to the destination address. <break time=\"0.6s\" /> "
         "Again, nothing is skipped or sped up."),
    (13, "This is the burn on Stellar Expert. <break time=\"0.5s\" /> "
         "It is successful, <break time=\"0.3s\" /> and it called deposit for burn on Circle's token messenger contract on Stellar."),
    (14, "And this is the mint on Base Sepolia: <break time=\"0.4s\" /> the receive message call on Circle's message transmitter, <break time=\"0.3s\" /> which credited the USDC to the destination address."),
    (15, "The history tab now lists both transfers as Bridge transactions: <break time=\"0.4s\" /> Base Sepolia to Stellar Testnet, and Stellar Testnet back to Base Sepolia, <break time=\"0.3s\" /> "
         "each with its own source and destination transaction hashes."),
    (16, "That completes the round trip: <break time=\"0.4s\" /> USDC moved from Base to Stellar and back, entirely through AutoRamp's interface, <break time=\"0.3s\" /> "
         "with every transaction verifiable on chain. Thank you for watching."),
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
