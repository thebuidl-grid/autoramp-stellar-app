#!/usr/bin/env python3
"""Stitch a real D2 recording with per-scene narration into a finished mp4.

  python3 scripts/stitch_d2_real.py --legs in    -> docs/autoramp_d2_crosschain_offramp_demo.mp4  (Base -> Stellar)
  python3 scripts/stitch_d2_real.py --legs out   -> docs/autoramp_d2_stellar_to_base_demo.mp4     (Stellar -> Base)
  add --silent to cut without narration (preview; used when narration audio is missing)

Reads demo_assets_d2/marks_<legs>.json + raw_<legs>.webm (record_d2_real.py) and scene_<n>.mp3 +
scene_durations.json (generate_voiceover_d2.py). A scene's footage ends at its "<scene>__end" mark (before the
app navigates away) so page-load frames never appear; if narration is longer than the footage, the last frame is held.
"""
import json, os, subprocess, sys

LEGS = sys.argv[sys.argv.index("--legs") + 1] if "--legs" in sys.argv else "in"
if LEGS == "full":
    # One video: Base -> Stellar (scenes 1-7) followed by the return trip (scenes 9-16). Needs both legs stitched first.
    parts = [f"demo_assets_d2/segments_in/scene_{n}.mp4" for n in range(1, 8)] + [f"demo_assets_d2/segments_out/scene_{n}.mp4" for n in range(9, 17)]
    missing = [p for p in parts if not os.path.exists(p)]
    if missing:
        sys.exit("Stitch --legs in and --legs out first; missing: " + ", ".join(missing[:3]))
    lst = "demo_assets_d2/segments_full_list.txt"
    open(lst, "w").write("".join(f"file '{os.path.abspath(p)}'\n" for p in parts))
    final = "docs/autoramp_d2_full_demo.mp4"
    r = subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", final], capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-800:])
    d = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", final]).decode())
    print(f"Final: {final}  ({d:.0f}s = {d/60:.2f} min, {os.path.getsize(final)/1e6:.1f} MB)")
    sys.exit(0)
SILENT = "--silent" in sys.argv
OUT = "demo_assets_d2"
CFG = {
    "in": (["intro", "connect", "form", "transfer", "explorer_src", "explorer_dst", "history", "outro"], 1,
           "docs/autoramp_d2_crosschain_offramp_demo.mp4"),
    "out": (["o_intro", "o_connect", "o_form", "o_transfer", "o_explorer_src", "o_explorer_dst", "o_history", "outro"], 9,
            "docs/autoramp_d2_stellar_to_base_demo.mp4"),
}
SCENES, N0, FINAL = CFG[LEGS]
LEAD_IN, TAIL = 0.4, 0.8
CAP_EXTRA = {"intro": 4.0, "o_intro": 4.0}   # a looping cursor tour never needs to outlast its narration by much

m = json.load(open(f"{OUT}/marks_{LEGS}.json"))
t = {x["scene"]: x["t"] for x in m["marks"]}
lead = m["lead"]
raw = f"{OUT}/raw_{LEGS}.webm"
dur_file = f"{OUT}/scene_durations.json"
dur = json.load(open(dur_file)) if os.path.exists(dur_file) else {}
seg_dir = f"{OUT}/segments_{LEGS}"; os.makedirs(seg_dir, exist_ok=True)


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit("ffmpeg failed:\n" + r.stderr[-1500:])


parts, total = [], 0.0
for i, name in enumerate(SCENES):
    n = N0 + i
    start = lead + t[name]
    nxt = (SCENES + ["end"])[i + 1]
    end = lead + t.get(name + "__end", t[nxt])
    seg = max(0.5, end - start)
    mp3 = f"{OUT}/scene_{n}.mp3"
    have_audio = (not SILENT) and os.path.exists(mp3) and str(n) in dur
    narr = float(dur[str(n)]) if have_audio else 0.0
    if have_audio and name in CAP_EXTRA:
        seg = min(seg, narr + LEAD_IN + TAIL + CAP_EXTRA[name])
    length = max(seg, narr + LEAD_IN + TAIL) if have_audio else seg
    hold = max(0.0, length - seg)
    out = f"{seg_dir}/scene_{n}.mp4"
    vf = "fps=25,scale=1920:1080,format=yuv420p" + (f",tpad=stop_mode=clone:stop_duration={hold:.3f}" if hold > 0.02 else "")
    if have_audio:
        a_in, a_f = ["-i", mp3], f"[1:a]adelay={int(LEAD_IN*1000)}|{int(LEAD_IN*1000)},apad=whole_dur={length:.3f}[a]"
    else:
        a_in, a_f = ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"], f"[1:a]atrim=0:{length:.3f}[a]"
    run(["ffmpeg", "-y", "-ss", f"{start:.3f}", "-t", f"{seg:.3f}", "-i", raw] + a_in +
        ["-filter_complex", f"[0:v]{vf}[v];{a_f}", "-map", "[v]", "-map", "[a]", "-t", f"{length:.3f}",
         "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2", out])
    parts.append(out); total += length
    print(f"@{total-length:6.1f}s scene {n:>2} {name:<17} footage {seg:6.1f}s  narration {narr:5.1f}s -> {length:6.1f}s"
          + (f"  (held last frame {hold:.1f}s)" if hold > 0.02 else ""))

lst = f"{seg_dir}/list.txt"
open(lst, "w").write("".join(f"file '{os.path.abspath(p)}'\n" for p in parts))
run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", FINAL])
print(f"\nFinal: {FINAL}  ({total:.0f}s = {total/60:.2f} min, {os.path.getsize(FINAL)/1e6:.1f} MB)")
