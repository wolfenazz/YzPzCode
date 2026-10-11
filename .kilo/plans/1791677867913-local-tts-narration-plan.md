# Local TTS Narration for Presentation + Report Workspaces — Implementation Plan

## Goal
Add offline, downloadable text-to-speech narration inside YzPzCode so users can listen to Arabic speaker notes (and English text) while editing and while presenting:
- Presentation editor: Speak button on the speaker-notes bar reads the current slide's `notes`.
- Slideshow / presenter: narration controls in/above `pr-show__bar` read the visible slide's notes (screenshot "ADD Here").
- Report workspace: read-aloud for selection / current section via toolbar + selection menu.
- Multi-model catalog with speed/quality/size tags; user downloads only what they need. Local models only (no cloud/API keys in v1).

## Agreed decisions (from user)
1. **Runtime: managed Python venv (local only).** Tauri detects `python3/python`, `ffmpeg`, creates per-user venv, `pip install`s model packages on demand. Weights in Tauri app-data. Synthesis via small local Python bridge (loopback HTTP or stdio JSON), WAV out, playback via existing `yzpzmedia` protocol + `<audio>`. OS `speechSynthesis` only as degraded fallback when Python unavailable (not listed as a model).
2. **Catalog v1 (local only):** SILMA TTS v1 (default bilingual AR/EN) + Lahgtna-Chatterbox (dialects) + Kokoro-82M (ultra-fast English). No ElevenLabs/HF-Inference in v1.
3. **UX: manual per-slide/section.** Play/Stop + speed 0.75/1/1.25 + model/voice pick, auto AR/EN detect, WAV cache per text-hash for instant replay. No autoplay-by-default.
4. **Voices: bundled defaults only.** Ship 2–3 reference wavs (AR-MSA male/female + EN neutral) in app resources; auto-pick by detected language. No custom upload in v1 (defer consent/storage UI to v2).
5. **Manager UI: inline + Settings.** Speak-button dropdown shows model list with download state; new Settings → Narration section is full manager (Python/ffmpeg/venv/disk + per-model cards).

## Why these models (Awesome-Arabic-AI + SILMA card)
Source: `https://github.com/OmarSalah26/Awesome-Arabic-AI` (§ Arabic TTS Excellence, Trending) and `https://huggingface.co/silma-ai/silma-tts`.

| Model | Use | Lang / dialect | Size / speed | License | Python entry |
|---|---|---|---|---|---|
| **SILMA TTS v1** (default) | Balanced MSA + EN | AR (Tashkeel) + EN bilingual, F5-diffusion 150M, RTF ~0.12 on RTX4090 | ~300–600MB weights, `pip install silma-tts`, needs `ffmpeg` + torch | Apache-2.0 weights / MIT code | `from silma_tts.api import SilmaTTS; .infer(ref_file, ref_text, gen_text, file_wave, speed)` |
| **Lahgtna-Chatterbox** | Dialects | EG/SA/MA/IQ + MSA, Tashkeel-aware | Larger/slower than SILMA, Gradio/Chatterbox stack | Check HF `oddadmix/lahgtna-chatterbox-v0` | via Chatterbox infer w/ dialect + ref voice |
| **Kokoro-82M** | Fast English | EN only | 82M, fastest CPU, small download | MIT/Apache (verify) | Kokoro python infer |
| Bundled refs | Voices | `ar-male.wav`, `ar-female.wav`, `en-neutral.wav` (<8s each, 24kHz) + transcripts | KBs, in `app/src-tauri/resources/tts-refs/` | Owned/recorded, Apache-compatible | passed as `ref_file/ref_text` |

SILMA alone already satisfies "Arabic + English" — Kokoro is a speed option for long English reports.

## Current codebase insertion points (verified)
- Presentation legacy editor notes: `app/src/components/presentation/PresentationWorkspace.tsx:879-897` (`pr-notes`, `pr-notes__input`, `selectedSlide.notes`).
- Designed editor notes (screenshot deck): `app/src/components/presentation/DesignedEditor.tsx:1202-1219` (`patchSlide(... {notes})`).
- Slideshow bar + presenter notes: `app/src/components/presentation/PresenterMode.tsx:214-264` (`pr-show__bar`, `pr-show__notes`, `current.notes`, `next`). "ADD Here" = new narration row above/in `pr-show__bar`.
- Report editor: `app/src/components/writing/WritingWorkspace.tsx:459` (`StudioToolbar`), `:537` (`SelectionMenu`), PagedEditor content via Tiptap `Editor` (`editorRef`).
- Report toolbar file: `app/src/components/writing/StudioToolbar.tsx:1-80`; bubble menu: `app/src/components/writing/SelectionMenu.tsx:29-60`.
- Playback infra exists: `app/src/utils/mediaFiles.ts:21-22` (`localFileUrl` → `yzpzmedia` protocol with Range, see `app/src-tauri/src/filesystem/media_protocol.rs`). Reuse for WAV.
- Rust deps today: no Python/ONNX/ffmpeg helpers — only `process.rs`/`env.rs` spawn helpers, `reqwest`, `portable-pty`. New `tts` module needed. Register commands in `app/src-tauri/src/lib.rs` `generate_handler!`.
- Settings nav: `app/src/components/settings/SettingsScreen.tsx:39-79` (`SettingsSection` union + `GROUPS`). Add `narration` section + `SettingsNarration.tsx`. Persist prefs in new `ttsStore.ts` (mirror `presentationStore.ts` pattern, key `yzpzcode-tts`).

## Architecture
```
Frontend (React/Zustand)                 Rust backend (Tauri)                  Python venv (%AppData%/YzPzCode/tts/*)
useTtsPlayback + NarrateButton ──invoke──▶ tts_commands.rs ──spawn/manage──▶ tts_bridge.py (loopback 127.0.0.1:PORT or stdio)
  ├ model picker dropdown                  ├ detect python/ffmpeg/venv         ├ lazy import silma/chatterbox/kokoro per model id
  ├ speed + lang detect                    ├ download weights (HF) w/ progress ├ synthesize chunk → wav (24k mono)
  └ <audio src=localFileUrl(wav)>          ├ cache wav by sha1(text|model|voice|speed)  └ pre-chunk long notes (~250 chars, sentence split)
Settings/Narration ◀── events (download %, synth done/error) ──┘
```

- **No new Node deps** for synthesis. Python is the only new prerequisite (same UX as existing Node check in `NodeJsCheckScreen`/`PrerequisitesPanel`).
- **Storage:**
  - Weights: `<appData>/tts-models/<modelId>/` (HF snapshot). Show size on disk.
  - WAV cache: `<appData>/tts-cache/<sha1>.wav` + optional deck-local `.narration/` copy later; v1 global cache only (portability deferred).
  - Bundled refs: `app/src-tauri/resources/tts-refs/*.wav` + `.txt`.
- **Language detect (frontend, no dep):** `arabicChars / letters > 0.25 → ar else en`; manual override dropdown per playback. Tashkeel passed through untouched; never strip diacritics.
- **Chunking:** split notes/sections on `[\n\\.؟?!\u06D6]+` ≤ ~250 chars; synthesize sequentially; concat via wav-join in Python (or play queue in JS — prefer Python join for single `<audio>` + seek).
- **Stop semantics:** per-unit Stop button + auto-stop on slide change / editor unmount / new Play. One global `Audio` instance in `useTtsPlayback` to avoid overlaps.

## Ordered task list
### 1. Rust: `tts` module + commands (backend foundation)
- New `app/src-tauri/src/tts/{mod.rs,env.rs,models.rs,bridge.rs,cache.rs}`:
  - `env.rs`: `detect_python() -> {path, version}`, `detect_ffmpeg()`, `ensure_venv()` (create in app-data, `pip install silma-tts[chatterbox,kokoro]` per model on demand), disk-space check (~2.5GB free warn).
  - `models.rs`: `TTS_CATALOG: [silma, lahgtna, kokoro]` with `{id, label, langs, dialects, sizeMB, speed(1-5), quality(1-5), pipSpec, hfRepo, licenseUrl}`; `model_status()` (not-downloaded/downloading %/ready/error), `download_model(id)` streaming via `reqwest` (re-use redirect guard pattern from `presentation_commands.rs:35-51`), `delete_model(id)`.
  - `bridge.rs`: manage `tts_bridge.py` child (free loopback port, health check, `POST /synthesize {modelId,text,voice,speed} → {wavPath,durationMs}`), restart on crash, kill on app exit; emit `tts-download-progress`, `tts-synth-progress` events.
  - `cache.rs`: `sha1(text|model|voice|speed|bridgeVersion)` → wav path; LRU evict >500MB.
- New `app/src-tauri/src/commands/tts_commands.rs`: `tts_status`, `tts_ensure_env`, `tts_list_models`, `tts_download_model`, `tts_cancel_download`, `tts_delete_model`, `tts_synthesize`, `tts_cancel_synth`. All `Result<T,String>` with `.map_err(|e| e.to_string())`.
- Register in `lib.rs` handler; add `resources/tts-refs/` to bundle; add `reqwest` streaming + `sha2` (already present) + `tauri::path` app-data usage. No ONNX/torch in Rust.
- Validate: `cargo check` + `cargo clippy` (from `app/src-tauri/`), zero warnings.

### 2. Python bridge script (single file, stdlib + model libs only)
- New `app/src-tauri/resources/tts_bridge.py` (~250 lines): argparse `--port --models-dir --cache-dir`; lazy model loaders (`load_silma/load_lahgtna/load_kokoro`); `/health`, `/synthesize` (chunk→infer→join→write wav), `/cancel`. CPU threads=auto, `torch.set_num_threads`, no GPU requirement. Log to stderr; never bind 0.0.0.0.
- Include `requirements-tts-{silma,lahgtna,kokoro}.txt` pinning versions; venv installs only the selected model's file.
- Validate: `python tts_bridge.py --help`, manual `curl /synthesize` with bundled ref on Windows CPU; assert 24k mono wav + <60s for 500-char AR note on CPU.

### 3. Frontend shared: store + hook + UI primitives
- New `app/src/stores/ttsStore.ts` (persist `yzpzcode-tts`): `{defaultModelId, speed, voiceByLang:{ar,en}, autoDetect:true, autoplayInPresenter:false, modelOverrideBySlide?:{}}` + actions.
- New `app/src/hooks/useTtsPlayback.ts`: `speak(text, opts)`, `stop()`, `status: idle|preparing|synthesizing|playing|error`, `progress`, `audioRef`; uses `invoke('tts_synthesize')` then `localFileUrl(wav)`; single shared `HTMLAudioElement`; cancels on unmount.
- New `app/src/components/tts/NarrateButton.tsx` (Play/Stop + spinner + speed menu) and `TtsModelPicker.tsx` (model list w/ speed/quality/size badges + Download/Delete + progress). RTL-aware, `animations-disabled`-safe, Tailwind only.
- New `app/src/utils/tts/{langDetect.ts, chunk.ts}` with unit-testable pure fns.
- Validate: `npx tsc --noEmit` (from `app/`).

### 4. Presentation editor (both editors)
- `DesignedEditor.tsx` (~line 1204) and `PresentationWorkspace.tsx` (~line 881): add `NarrateButton` into `.pr-notes__head` row (right side) bound to `slide.notes` / `selectedSlide.notes`; disabled + tooltip when empty; error toast on failure via existing `onToast`/`setToast`.
- Picker dropdown anchored to same row (model + voice + speed); changing model triggers download flow inline.
- Validate: open Arabic deck (screenshot deck), play slide-1 notes, switch model to Lahgtna (prompts download), replay uses cache instantly.

### 5. PresenterMode slideshow ("ADD Here")
- `PresenterMode.tsx` (`pr-show__bar` ~line 254): add narration row above bar (visible in both audience + presenter layouts): `NarrateButton` for `current.notes` + `TtsModelPicker` compact + optional autoplay toggle (default off). Stop on `advance/retreat/go/exit` (hook into existing `go/advance/retreat/exit` callbacks). Presenter notes pane (`pr-show__notes` ~line 247) gets mini play button too.
- Keyboard: do not hijack `Space/Enter/arrows`; add `R` = speak/stop current notes (document in hint string next to "B black · W white…").
- Validate: F5 slideshow, R speaks slide 1 AR notes, → auto-stops, next slide speaks new notes.

### 6. Report workspace
- `StudioToolbar.tsx`: add read-aloud group (Speak selection else current section, speed menu). Determine section via existing `findSectionRange`/`sectionBodyJson` helpers used in `WritingWorkspace.tsx:349-364`; text via `blocksToMarkdown`.
- `SelectionMenu.tsx` bubble: add "Read aloud" item calling same hook with selected text.
- Validate: select Arabic paragraph → bubble → plays; cursor in section → toolbar → plays section; long section chunks without cutoff.

### 7. Settings → Narration manager
- New `app/src/components/settings/sections/SettingsNarration.tsx` + register `narration` in `SettingsScreen.tsx` groups (icon `SpeakerHigh`/`Waveform`). Cards per model: description, langs/dialects, size, speed/quality bars, license link (SILMA Apache-2.0, Lahgtna HF page, Kokoro license), Download/Pause/Delete + progress bar + disk use; env panel: Python path/version, ffmpeg presence, venv path, Clear cache button.
- Validate: fresh machine shows Python-missing guidance; download → progress events → Ready; delete frees disk.

### 8. Polish, a11y, i18n
- Empty-notes, >2000-char, missing-model, missing-Python/ffmpeg, download-fail, synth-fail states with Arabic + English strings (RTL for AR tooltips). Respect `animations-disabled`, `light-theme`, density classes. No `any`, explicit return types, `import type` for types.

## Failure modes & handling
| Case | Handling |
|---|---|
| No Python / too old (<3.10) | Settings shows install link + winget/brew guidance; Speak button tooltip "Python 3.10+ required"; OS speech fallback offered |
| No ffmpeg | Warn (SILMA/Chatterbox need it for resample); link install; block download until present |
| Download interrupted / low disk | `tts_cancel_download`, resume or restart; pre-check free space; partial files cleaned |
| CPU slow (long notes) | Chunk + progress %, Cancel button; cache makes replay instant; recommend SILMA/Kokoro for speed |
| Empty notes / English text with AR model | Disabled button / auto-switch to EN voice (SILMA bilingual) or Kokoro |
| Bridge crash | Auto-restart once, error event with log tail; Speak shows retry |
| Concurrent plays | Single audio instance; new Play stops old; slide change stops |

## Rollout / migration
- No DB/deck schema change in v1 (notes fields untouched; cache outside decks). Feature-flag via `ttsStore.enabled` default true; safe to ship dark and enable per workspace. v2 candidates: deck-local `.narration/` portability, PPTX/video export with audio, custom voice upload with consent log, per-slide voice override, autoplay deck playlist.

## Validation plan (implementer must run)
1. `cargo check && cargo clippy` (app/src-tauri) — zero warnings; `npx tsc --noEmit` (app/).
2. Manual: (a) editor notes speak (AR), (b) presenter R + bar controls, (c) report selection + section, (d) model download/delete/progress, (e) cache replay instant, (f) Python-missing + empty-notes + cancel-download paths.
3. Existing suites: `npm run test:presentation`, `npm run test:writing` (from app/) — no regressions.
4. Audio QA: AR MSA with/without Tashkeel intelligible, EN neutral, no truncation at chunk joints, 24kHz wav seeks via `yzpzmedia`.

## Risks
- PyTorch CPU wheel size (~200MB) + model weights (~0.5–2GB total if all three) — mitigated by per-model on-demand download + disk display.
- Lahgtna/Chatterbox API drift — pin versions, isolate loader so SILMA default never breaks.
- Dialect quality variance — label Lahgtna as "dialect/quality, slower", SILMA as "default/balanced".

## Out of scope (v1)
Cloud TTS/APIs/keys, custom voice cloning upload, deck-embedded audio export, auto-narrated video export, STT, LLM dubbing.
