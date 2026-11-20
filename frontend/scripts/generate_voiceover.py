import sys
import os
import json
import subprocess
import urllib.request
import urllib.error

API_KEY = "sk_d9278aa662e1fa03c5373713060ffe09a169e72aa16bca84"
VOICE_ID = "3bxxjfGBGMh013c9hRr9"
MODEL_ID = "eleven_v4"
OUTPUT_DIR = "demo_assets"

os.makedirs(OUTPUT_DIR, exist_ok=True)

SCRIPTS = [
    (1, "Hello everyone... <break time=\"0.6s\" /> I'm Andrew, <break time=\"0.3s\" /> and welcome to this walkthrough of AutoRamp. <break time=\"0.8s\" /> Today, <break time=\"0.3s\" /> I'm excited to demonstrate our hardened Stellar testnet USDC off-ramp. <break time=\"0.8s\" /> AutoRamp bridges Web3 liquidity with local banking rails, <break time=\"0.4s\" /> featuring a resilient state machine with complete failure handling for rejected payouts, <break time=\"0.3s\" /> reversals, <break time=\"0.3s\" /> and insufficient liquidity, <break time=\"0.5s\" /> backed by persistent statuses, <break time=\"0.3s\" /> structured reconciliation logging, <break time=\"0.3s\" /> and verified on-chain settlement."),
    (2, "Starting on the AutoRamp dashboard... <break time=\"0.6s\" /> we select the Sell tab with USDC on the Stellar network. <break time=\"0.7s\" /> With our connected Stellar testnet wallet, <break time=\"0.3s\" /> we initiate an off-ramp payout of five thousand Naira to our destination bank account. <break time=\"0.8s\" /> AutoRamp generates the secure deposit instructions with exact funding parameters. <break time=\"0.7s\" /> We fund the deposit on-chain with one click... <break time=\"0.4s\" /> and verify the live transaction hash directly on the Stellar Expert testnet explorer."),
    (3, "Moving over to Transaction History... <break time=\"0.6s\" /> AutoRamp guarantees robust handling for real-world provider exceptions. <break time=\"0.7s\" /> When a banking partner restricts an account, <break time=\"0.3s\" /> the payout transitions to Rejected with reason rejected. <break time=\"0.7s\" /> If a banking rail triggers an interbank reversal, <break time=\"0.3s\" /> the state machine safely captures it as Reversed with reason reversal. <break time=\"0.7s\" /> And when provider fiat liquidity is constrained, <break time=\"0.3s\" /> it is recorded as insufficient liquidity. <break time=\"0.6s\" /> These complement our automated expiry sweeps and partial settlement detection."),
    (4, "Every transaction status in AutoRamp is strictly persistent. <break time=\"0.6s\" /> Statuses advance deterministically from Pending to Processing to terminal states, <break time=\"0.3s\" /> persisted in PostgreSQL and synchronized over WebSockets. <break time=\"0.8s\" /> Expanding any cash-out reveals its full reconciliation record: <break time=\"0.4s\" /> the verified Stellar deposit hash, <break time=\"0.3s\" /> expected versus received USDC amounts, <break time=\"0.3s\" /> destination bank details, <break time=\"0.3s\" /> and complete chronological state transitions matching our backend reconciliation endpoint."),
    (5, "Under the hood... <break time=\"0.5s\" /> every cash-out generates structured reconciliation logs. <break time=\"0.6s\" /> Incoming Bitnob webhooks are cryptographically validated with HMAC SHA-512, <break time=\"0.4s\" /> emitted with structured JSON logging, <break time=\"0.3s\" /> and recorded into our WebhookEvent and TransactionLog database tables. <break time=\"0.8s\" /> Powered by BullMQ background workers, <break time=\"0.3s\" /> our audit pipeline guarantees immutable traceability with zero dropped state transitions."),
    (6, "With verified on-chain Stellar proof, <break time=\"0.5s\" /> comprehensive failure recovery across rejections, <break time=\"0.3s\" /> reversals, <break time=\"0.3s\" /> and liquidity limits, <break time=\"0.5s\" /> persistent status persistence, <break time=\"0.3s\" /> and structured reconciliation logs, <break time=\"0.5s\" /> AutoRamp's off-ramp is fully verified and production-ready. <break time=\"0.7s\" /> Thank you for watching!")
]

def generate_tts(scene_num, text, force=False):
    out_file = os.path.join(OUTPUT_DIR, f"scene_{scene_num}.mp3")
    if not force and os.path.exists(out_file) and os.path.getsize(out_file) > 1000:
        print(f"Scene {scene_num} audio already exists ({os.path.getsize(out_file)} bytes), skipping generation.")
        return out_file

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    headers = {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
    }
    payload = {
        "text": text,
        "model_id": MODEL_ID,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75
        }
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers, method="POST")
    try:
        print(f"Generating TTS for Scene {scene_num} using model {MODEL_ID} ({len(text)} chars)...")
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
    force_all = "--force" in sys.argv
    durations = {}
    total_chars = sum(len(text) for _, text in SCRIPTS)
    print(f"Total script characters across all 6 scenes: {total_chars}")
    
    for scene_num, text in SCRIPTS:
        # Force re-generate if --force is passed or for scene 1 specifically if requested
        force = force_all or (scene_num == 1 and "--force-scene-1" in sys.argv)
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
