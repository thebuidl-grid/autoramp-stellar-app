import sys
import os
import json
import subprocess
import urllib.request
import urllib.error

API_KEY = "sk_72a2570c9c5b8ffc099b7bd0826495473380b9162fdb09b6"
VOICE_ID = "3bxxjfGBGMh013c9hRr9"
OUTPUT_DIR = "demo_assets"

os.makedirs(OUTPUT_DIR, exist_ok=True)

SCRIPTS = [
    (1, "Hello everyone... <break time=\"0.6s\" /> I'm Andrew, <break time=\"0.3s\" /> and welcome to this walkthrough of AutoRamp. <break time=\"0.8s\" /> Today, <break time=\"0.3s\" /> I'm excited to demonstrate what we've built. <break time=\"0.5s\" /> Specifically, <break time=\"0.3s\" /> our hardened Stellar testnet off-ramp. <break time=\"0.8s\" /> AutoRamp bridges Web3 liquidity <break time=\"0.3s\" /> with local banking rails, <break time=\"0.5s\" /> providing a seamless, <break time=\"0.3s\" /> verifiable off-ramp flow <break time=\"0.4s\" /> with real on-chain settlement."),
    (2, "Starting on the AutoRamp dashboard... <break time=\"0.6s\" /> we select the Sell tab. <break time=\"0.5s\" /> Here, <break time=\"0.2s\" /> we choose USDC as our asset, <break time=\"0.3s\" /> and switch our network over to Stellar. <break time=\"0.8s\" /> AutoRamp connects directly with our Stellar wallet... <break time=\"0.4s\" /> so our testnet address is instantly ready. <break time=\"0.7s\" /> Next, <break time=\"0.2s\" /> we enter five thousand Naira for our payout, <break time=\"0.4s\" /> and select our destination bank account."),
    (3, "When we initiate the off-ramp... <break time=\"0.5s\" /> AutoRamp generates a secure order with exact deposit instructions: <break time=\"0.6s\" /> the designated deposit address, <break time=\"0.3s\" /> the expected USDC amount, <break time=\"0.3s\" /> and the required memo. <break time=\"0.8s\" /> We can send the USDC directly from our connected Stellar wallet with just one click... <break time=\"0.5s\" /> producing a verified, <break time=\"0.3s\" /> on-chain testnet transaction."),
    (4, "Moving over to Transaction History... <break time=\"0.6s\" /> we have full reconciliation visibility. <break time=\"0.6s\" /> Expanding our off-ramp order reveals the completed status, <break time=\"0.3s\" /> the exact bank payout details, <break time=\"0.4s\" /> and the verifiable Stellar transaction hash linking straight to the explorer. <break time=\"0.8s\" /> We can confirm expected versus received amounts... <break time=\"0.4s\" /> with complete transparency."),
    (5, "AutoRamp also includes robust failure handling. <break time=\"0.6s\" /> If a deposit window ever passes without funding... <break time=\"0.4s\" /> our sweep engine automatically expires the order. <break time=\"0.8s\" /> And if an order is underfunded, <break time=\"0.3s\" /> it is cleanly marked as a partial settlement with full audit tracking. <break time=\"0.8s\" /> Thank you so much for watching!")
]

def generate_tts(scene_num, text, force=False):
    out_file = os.path.join(OUTPUT_DIR, f"scene_{scene_num}.mp3")
    if not force and os.path.exists(out_file) and os.path.getsize(out_file) > 1000:
        print(f"Scene {scene_num} audio already exists ({os.path.getsize(out_file)} bytes), skipping generation to preserve quota.")
        return out_file

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    headers = {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
    }
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method="POST")
    try:
        print(f"Generating TTS for Scene {scene_num} ({len(text)} chars)...")
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            with open(out_file, "wb") as f:
                f.write(data)
            print(f"Saved Scene {scene_num} audio to {out_file} ({len(data)} bytes)")
            return out_file
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        print(f"ElevenLabs HTTP Error {e.code}: {err_body}")
        raise e

def get_duration(audio_file):
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_file]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, text=True, check=True)
    return float(res.stdout.strip())

def main():
    force = "--force" in sys.argv
    durations = {}
    total_chars = sum(len(text) for _, text in SCRIPTS)
    print(f"Total script characters across all 5 scenes: {total_chars}")
    
    for scene_num, text in SCRIPTS:
        f = generate_tts(scene_num, text, force=force)
        dur = get_duration(f)
        durations[scene_num] = dur
        print(f"Scene {scene_num} duration: {dur:.2f} seconds")

    total_duration = sum(durations.values())
    print(f"Total narration duration: {total_duration:.2f} seconds ({total_duration/60:.2f} minutes)")

    with open(os.path.join(OUTPUT_DIR, "scene_durations.json"), "w") as jf:
        json.dump(durations, jf, indent=2)

if __name__ == "__main__":
    main()
