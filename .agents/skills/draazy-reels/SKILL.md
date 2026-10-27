---
name: draazy-reels
description: Make Draazy SaaS demo videos — 9:16 Instagram Reels (and the 16:9 launch film) — from the real app UI, with an Indian-English voice-over, synced captions, music and UI sound effects, using only tools already on this machine (Playwright Chromium, Node, Edge TTS, Windows Media Foundation). Use when asked to create, revise, re-voice, re-time or re-zoom a Draazy reel, promo, demo or launch video, add captions/voice/SFX to one, or explain how the reel pipeline works. Encodes the layout spec, voice and script rules, sound-effect levels, capture safety rules and Windows gotchas learned building brag-reel v1–v3.
---

# Draazy reels

A lean, no-install take on the `/brag` approach (latent-spaces/brag): every video is an HTML composition
with a seekable `window.render(t)`, screenshotted frame by frame with Playwright and encoded with Windows'
built-in Media Foundation. No Remotion, HyperFrames or ffmpeg.

Everything lives in `brag-output/` (git-excluded via `.git/info/exclude`). The working directory is
`brag-output\work\`; finished videos go in `brag-output\`. `brag-output\brag-plan.md` has the exact rebuild
commands for every existing video. Read its reel section before changing anything.

## Hard rules

1. **Never commit**, and never touch `frontend/src`, `backend/` or another session's files. Other sessions
   work in this folder too; check `LastWriteTime` before editing a shared script, and extend rather than rewrite.
2. **Read-only against the dev backend/DB.** Captures sign in as the fictional user "Rahul" (`rahul.cjs`):
   `/auth/me` and `/auth/refresh` answered locally, other GETs proxied without the token, every non-GET
   blocked. Never write to the shared DB.
3. **No real people's data on screen.** Swap real owner names/numbers for fictional ones at capture time
   (see `fictionalOwner()` in `m-capture.cjs`: Aarav Kulkarni, +91 98••• •••42).
4. **Never overwrite a version the user has seen.** New cut → `brag-reel-vN.mp4` + `brag-reel-vN.jpg`,
   gated by `?v=N` / `REEL_V=N` so older versions still rebuild identically.
5. **Secrets:** never store a token the user pastes in chat; use it only as a process env var, and tell them to revoke it.
6. **Show before you ship:** voice samples before re-voicing, a stills contact sheet before a full render.
7. **Phone never cut off at the bottom.** The whole phone frame stays inside the 1080×1920 canvas in every
   scene (camera zoom ≤ 1.274 at base scale 1.35; see Layout spec). Check the contact sheet for it.
8. **Script in full sentences.** Every voice line is a complete, natural, impactful sentence a presenter
   would say, never clipped words or labels read out ("Ownership papers? Checked."). Reel ≤ 30 s.
9. **Logo animation only at the end.** No splash or logo reveal mid-reel; the logo animates only in the
   closing outro.

## Pipeline

```
capture (real UI, PNG layers + rects.json)  →  script (cues.json)  →  voice.py (vo/*.wav + subs.js)
→ music.cjs (audio-*.wav) → mix.cjs (voice + ducked music) → sfx.cjs (CC0 UI sounds)
→ render.cjs (frames-*/ JPEGs) → encode.ps1 (MP4 + poster) → verify.cjs
```

Run from `brag-output\work`, always with
`$env:NODE_PATH="C:\Users\E159518\Documents\Learning\e2e\node_modules"` (Playwright lives there).

| Step | Launch reel (`reel\`) | Per-reel folder (`reels\<slug>\`) |
|---|---|---|
| Private Vite (capture only) | `cd frontend; $env:VITE_PROXY_TARGET='http://localhost:9090'; npx vite --config ..\brag-output\work\vite.brag.config.mjs --port 5199 --strictPort --host 127.0.0.1` (async; HMR off so other sessions' edits can't reload mid-shot). Stop it after. | same |
| Capture | `node m-capture.cjs` → `assets-m\` | `node reels\<slug>\capture.cjs` → `reels\<slug>\assets\` (helpers in `mcap.cjs`) |
| Voice + subs | `tts-venv\Scripts\python.exe voice.py en-IN-NeerjaNeural 1.04 reel\cues.json` | `... voice.py en-IN-NeerjaNeural 1.04 reels\<slug>\cues.json` |
| Music | `node music.cjs reel` → `audio-reel.wav` | `node music.cjs reels\<slug>` → `audio-<slug>.wav` |
| Mix | `node mix.cjs reel-en-IN-NeerjaNeural audio-reel.wav` | `node mix.cjs <slug>-en-IN-NeerjaNeural audio-<slug>.wav` |
| SFX | `node sfx.cjs audio-vo-reel-en-IN-NeerjaNeural.wav vo\reel-en-IN-NeerjaNeural.wav reel\sfx-cues.json audio-vo-reel-sfx.wav` | same shape, with the slug's files |
| Stills | `$env:REEL='1'; $env:REEL_V='2'; node render.cjs stills 3,9,13.4` → `stills-reel2\` | `$env:REEL_DIR='reels/<slug>'; node render.cjs stills ...` → `stills-<slug>\` |
| Frames | `... node render.cjs frames 30` → `frames-reel2\` (wiped each run) | → `frames-<slug>\` |
| Encode | `powershell -NoProfile -ExecutionPolicy Bypass -File encode.ps1 -Frames <dir> -Audio <wav> -Poster ..\<name>.jpg -Name <name>.mp4 -Width 1080 -Height 1920` | same |
| Verify | `node verify.cjs <name>.mp4` (path relative to `brag-output`) → expect 1080×1920, stereo 48 kHz, exact duration | same |

Poster = a late outro frame (e.g. `f00948.jpg` for 32 s), copied before encoding.
If only the audio changes, re-use the existing frames folder — no re-render needed (that is how v3 was made).

## Layout spec (9:16, any screen of the app)

- **Canvas** 1080×1920, 30 fps. **Phone**: 390×844 app screen (47 px status bar + 797 px app) in a
  414×868 frame, centred horizontally. Base scale **1.35×** (`S`), camera zoom **1.2–1.274×** per scene
  (total scale ≤ ~1.72, phone ≈ 66% of the width).
- **Captions** at the top: start y ≈ 170, max two lines, end ≈ 310. They must never overlap the phone screen.
- **Phone top edge pinned at y ≈ 326**, just under the captions, for the whole reel (the camera clamps
  `fy` with `CAPTION_FLOOR`). **The whole phone stays in frame** — the user rejected a phone cut off at the
  bottom: `326 + 868·S·z ≤ ~1820`, so z ≤ 1.274.
- **Instagram safe zones:** nothing important in the top ~150 px, bottom ~350 px (y > 1570) or the right edge.
- **Zoom rule:** the highest zoom (≤ 1.274×) that keeps the feature in focus above y ≈ 1570; drop to ~1.2×
  for a beat whose feature sits lower (e.g. the selfie "Checks passed" title). Bottom-of-app features (sticky
  "Contact Owner", bottom nav) fall below 1570 at 1.274, so pull back to ~1.1× for that beat only.
- **Logo:** only in the outro. No splash/logo animation mid-reel; go from the lock screen to the app with an
  iOS swipe-up unlock (`reels\trust-v2`).
- **Motion:** eased zoom between keyframes, no sideways pans. Keep attention on the feature — big and close,
  never a small phone floating in space (a rejected attempt).
- Reference: `reel-trust-v2.mp4` / `reels\trust-v2\index.html`. Geometry: `X(x)=SX+x·S`, `Y(y)=SY+(47+y)·S`,
  canvas_y = `CY + z·(Y − fy)`; feature-visible check: `326 + S·z·(appY + 59) ≤ 1570`.

## Script and voice

- **Write the script first, then sync the video to it.** It must sound like a person presenting, not an
  agent narrating: short spoken lines, contractions, problem → payoff, a question then its answer, real
  pauses (0.2–0.45 s), one idea per beat, brand + city at the end.
  Example: "You search for one flat in Pune... and the broker calls just don't stop."
  Every line is a complete, impactful sentence — no clipped fragments like "Ownership papers? Checked." that
  sound like reading out labels. Keep each reel **≤ 30 s**; shorten the weakest line rather than run over.
- `cues.json`: `duration`; `script` = `[sceneStart, [phrase | pauseSeconds | ["at", t]]]` (`"at"` pins the
  next phrase to an on-screen beat); optional `rates` (per-phrase Edge rate, e.g. `"Draazy.": -8`);
  `music: { hook, outro, whoosh, clicks }` in per-reel folders. `voice.py` reports overflows — fix them by
  shortening lines or nudging rates; ≤ 0.05 s is fine.
- **Indian English only, no Hindi.** Voice: Edge TTS `en-IN-NeerjaNeural` at speed 1.04 (user's pick from
  samples; `en-IN-NeerjaExpressiveNeural` and `en-IN-PrabhatNeural` are alternatives). It says "Pune"
  correctly; Kokoro did not. Edge is fine for demos — recommend Azure Speech (same voices, licensed) for paid ads.
- Edge quirks already handled in `voice.py`: phrase-by-phrase synthesis (whole-script reads sound robotic),
  MP3-only output decoded by `mp3wav.cjs` via Chromium, `tighten()` trims Edge's long full-stop gaps to
  0.16 s, script pauses ×0.6, clips cached in `vo\edge-cache\`.
- Local fallback: Indic Parler-TTS (`parler-venv`, `parler-model`, `parler_samples.py`) — good accent but
  ~90 s per clip on CPU. Kokoro (`hf_beta`) is the 16:9 film's voice.
- Captions come from `subs.js` (exact phrase times written by `voice.py`); highlight the key word.

## Sound

- **Music** (`music.cjs`): synthesized 120 BPM bed on the beat grid; `mix.cjs` ducks it to 0.32 under the
  voice with a 120 ms hold so it doesn't pump.
- **UI sound effects** (`sfx.cjs` + `sfx\`): CC0 files from `kmilo93sd/agent-video-editor` (commercial use,
  no attribution). One sound per on-screen event, ~15 dB under the voice, starting 60 ms before the event.
  Cue file: `[{ "t": 25.1, "s": "modal-open", "db": -2 }]` (`reel\sfx-cues.json` is the worked example).
  Mapping that worked: notifications → `notification-1..4`; swipe/page push → `slide-1/2`; tap →
  `click-soft`, search key → `click-sharp`; typing → `key-press` per letter at −6 dB; highlight ring →
  `select-1/2`; trust badge → `check-mark`, last badge → `success-1`; toast → `pop-1`; sheet → `modal-open`;
  outro → `send-whoosh-up`, `impact-soft-1`, `pop-1/2`. More sounds: `skills/editing-videos/library/sfx/`
  in that repo (fetch with `curl.exe --ssl-no-revoke`).
- `music.cjs` already synthesizes some whooshes/clicks; when adding CC0 clicks for the same taps, drop
  them from `music.clicks` to avoid doubling.
- Can't listen? Measure: effect RMS vs mix RMS around each cue should land ~15–22 dB below.

## Verify visually

Render stills at every scene's key moment and build one contact sheet (System.Drawing, 225×400 tiles, a
red line at y = 1570). Check: captions clear of the phone, the feature in focus large and above the line,
no real PII. Delete the stills and sheets afterwards.

## Windows / corporate-machine gotchas

- PowerShell 5.1: no `&&`; chain with `;`.
- AppLocker blocks new `.exe` launchers in venvs → `python -m edge_tts`, `python -m pip`.
- Unsigned DLLs in user folders are blocked (e.g. `libsndfile`) → stub the module (see `parler_samples.py`).
- TLS inspection: Python needs `truststore.inject_into_ssl()`; curl needs `--ssl-no-revoke`; big downloads
  resume with `curl.exe -C -`. Point `TMP`/`TEMP` at a work folder if pip hits WinError 32.
- The grep tool skips venvs; use `Select-String` there.

## Other skills to combine

- `mobile-native` — touch feel: taps, sheets, keyboard, safe areas (scenes must look like a real phone).
- `real-estate-expert` — domain truth for claims (KYC, verified listing, brokerage, RERA); no overclaiming.
- `senior-product-manager-realestate` — which feature to show, the hook and the single message per reel.
- `ui-ux-pro-max` → `frontend-design` — the look of new composition elements and the outro.
- `ponytail` — keep pipeline changes minimal; extend scripts, don't add frameworks.
- External, technique-only (don't install): the `zhuyansen/awesome-claude-video-skills` index —
  `kmilo93sd/agent-video-editor` (pacing, captions, audio levels, CC0 SFX/music),
  `Avijit07x/cursorcam` / `AbubakrChan/product-launch-motion` (cursor-driven auto-zoom),
  `hamen/app-promo-reel` (beat-synced 9:16 app reels). Read their SKILL.md and port the idea into this pipeline.

## Deliverables checklist

- [ ] `brag-output\<name>.mp4` + `.jpg`, verified 1080×1920, 30 fps, stereo 48 kHz, exact duration
- [ ] whole phone visible in every scene, every voice line a full sentence, logo only in the outro, ≤ 30 s
- [ ] earlier versions untouched; rebuild commands added to `brag-plan.md`
- [ ] temp stills / contact sheets / scratch audio removed; private Vite stopped
- [ ] nothing committed; no files outside `brag-output\` changed
