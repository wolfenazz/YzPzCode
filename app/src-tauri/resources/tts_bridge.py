#!/usr/bin/env python3
"""YzPzCode local TTS narration bridge (loopback HTTP, stdlib + model libs only).

Source of truth: .kilo/plans/1791677867913-local-tts-narration-plan.md (Task 2).
Owned by the Python worker — the Rust backend (separate worker) spawns this as::

    python tts_bridge.py --port <free 127.0.0.1 port> \
        --models-dir <appData>/tts-models --cache-dir <appData>/tts-cache

Endpoint contract (loopback only, never 0.0.0.0):
    GET  /health      -> {"ok": true, "version": BRIDGE_VERSION,
                          "loadedModels": ["silma", ...]}
    POST /synthesize  -> {"modelId": "silma"|"lahgtna"|"kokoro", "text": str,
                          "voice": "<ref filename>"|"auto", "speed": 0.75|1|1.25,
                          "outPath": "<file inside --cache-dir>" (optional)}
                         => {"ok": true, "wavPath": str, "durationMs": int,
                             "cached": bool, "chunks": int}
    GET  /progress    -> {"stage": "idle"|"loading"|"synthesizing"|"joining",
                          "done": int, "total": int, "message": str}
    POST /cancel      -> {"ok": true, "cancelled": true}

Synthesis pipeline (all models):
    1. split text on [\\n.؟?!\\u06D6]+ into chunks <= ~250 chars (split_text)
    2. synthesize each chunk sequentially via the model's lazy loader
    3. wav-join chunks in Python into ONE 24kHz mono 16-bit WAV (join_wavs)
    4. write to --cache-dir under sha1(model|voice|speed|version|text).wav

Notes / guarantees:
    * Tashkeel (diacritics) are passed through UNTOUCHED — never stripped or
      normalized. split_text only splits on boundaries and trims whitespace.
    * Model libraries are imported LAZILY inside load_silma/load_lahgtna/
      load_kokoro (first use only), so SILMA-default synthesis never breaks
      when Lahgtna/Chatterbox APIs drift. Each venv installs only the
      requirements-tts-<model>.txt file for the model the user selected.
    * CPU only: CUDA is hidden (CUDA_VISIBLE_DEVICES="") and
      torch.set_num_threads(os.cpu_count()) is applied when torch exists.
      No GPU requirement.
    * Missing reference wavs/transcripts are a clear 400 error, never a
      bridge crash. Bundled refs live in ../resources/tts-refs/ (see README).
    * All logs go to stderr; stdout stays clean for the Rust supervisor.
    * CPU perf expectation: <60s for a 500-char Arabic note on CPU with
      SILMA (RTF ~0.1-0.5 on CPU); long texts chunk with per-chunk cancel
      checks; WAV cache makes replay instant.

Failure handling (see plan "Failure modes"):
    * Bridge crash   -> Rust auto-restarts once; check stderr log tail.
    * Cancel         -> POST /cancel sets a flag checked between chunks;
                        in-flight model.infer() finishes, rest is skipped.
    * Concurrent POST /synthesize while busy -> 409, client should /cancel.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import struct
import subprocess
import sys
import tempfile
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# The supervisor redirects stdout/stderr to a file, so Python falls back to the
# Windows ANSI code page (cp1252) and any model library that prints an emoji
# (e.g. catt_tashkeel's "📥 Downloading…") dies with a `charmap` error.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

# ---------------------------------------------------------------------------
# Constants (mirror the Rust TTS_CATALOG in the sibling Rust worker)
# ---------------------------------------------------------------------------

BRIDGE_VERSION = "1.0.0"
SAMPLE_RATE = 24000  # all output WAVs: 24 kHz, mono, 16-bit PCM
MODEL_IDS = ("silma", "lahgtna", "kokoro")
ALLOWED_SPEEDS = (0.75, 1.0, 1.25)
ALLOWED_HOSTS = ("127.0.0.1", "::1", "localhost")
MAX_TEXT_CHARS = 6000  # hard cap (mirrors Rust MAX_TEXT_CHARS in tts/bridge.rs + REPORT_NARRATION_MAX_CHARS); longer texts must be chunked by the caller
CHUNK_LIMIT = 250  # per plan: split notes/sections to <= ~250 chars

# Contract chunking regex: split on [\n\.؟?!\u06D6]+ (delimiters are kept).
_SPLIT_RE = re.compile(r"([\n.\u061f?!\u06d6]+)")

# Lahgtna dialect -> Chatterbox language-code override (upstream mapping,
# Oddadmix/lahgtna-chatterbox README). Kept here for the Rust picker; the
# loader maps voice filenames like "ar-eg.wav" via this table. MSA = "ar".
DIALECT_TO_CHATTERBOX_LANG = {
    "ar": "ar", "eg": "ms", "sa": "sv", "mo": "pl", "iq": "no",
    "sd": "pt", "tn": "da", "lb": "nl", "sy": "ko", "ly": "sw", "ps": "he",
}

log = logging.getLogger("tts_bridge")

# Lazily-loaded model singletons: modelId -> backend-specific object.
_MODELS: dict[str, object] = {}
_MODELS_LOCK = threading.Lock()
# Only one synthesis at a time (single <audio> element upstream).
_SYNTH_LOCK = threading.Lock()
_CANCEL_EVENT = threading.Event()

MODELS_DIR = ""
CACHE_DIR = ""
REFS_DIR = ""  # <script-dir>/tts-refs (bundled reference voices)
VOICES_DIR = ""  # <appData>/tts/voices (user-supplied reference voices)

# Live synthesis progress, polled by the Rust supervisor via GET /progress.
_PROGRESS_LOCK = threading.Lock()
_PROGRESS: dict[str, object] = {"stage": "idle", "done": 0, "total": 0,
                                "message": ""}


def set_progress(stage: str, done: int = 0, total: int = 0,
                 message: str = "") -> None:
    with _PROGRESS_LOCK:
        _PROGRESS.update(stage=stage, done=done, total=total, message=message)


def get_progress() -> dict[str, object]:
    with _PROGRESS_LOCK:
        return dict(_PROGRESS)


# ---------------------------------------------------------------------------
# Text chunking (pure, Tashkeel-safe: never touches diacritics)
# ---------------------------------------------------------------------------

def split_text(text: str, limit: int = CHUNK_LIMIT) -> list[str]:
    """Split *text* on sentence boundaries into chunks <= *limit* chars.

    Splits on [\\n.؟?!\\u06D6]+ only; diacritics (Tashkeel incl. U+06D6
    runs inside words) are preserved byte-for-byte — only boundary
    whitespace is trimmed. A single over-long sentence is hard-cut at
    *limit* so no chunk ever exceeds the model window.
    """
    parts = _SPLIT_RE.split(text)
    chunks: list[str] = []
    current = ""
    for part in parts:
        if not part:
            continue
        if _SPLIT_RE.fullmatch(part):
            # Boundary delimiter: attach to the current chunk if it fits,
            # else close the chunk and start a fresh one with it.
            if len(current) + len(part) <= limit:
                current += part
            else:
                if current.strip():
                    chunks.append(current.strip())
                current = part.lstrip()
            continue
        piece = part
        while piece:
            room = limit - len(current)
            if len(piece) <= room:
                current += piece
                piece = ""
            else:
                if room > 0:
                    current += piece[:room]
                    piece = piece[room:]
                if current.strip():
                    chunks.append(current.strip())
                current = ""
    if current.strip():
        chunks.append(current.strip())
    return chunks


def cache_key(model_id: str, voice: str, speed: float, text: str) -> str:
    """Stable WAV cache filename base (Rust uses the same sha1 scheme)."""
    raw = f"{model_id}|{voice}|{speed}|{BRIDGE_VERSION}|{text}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# CPU setup (best-effort, never fatal)
# ---------------------------------------------------------------------------

def configure_cpu_threads() -> None:
    """Hide GPUs and size the torch thread-pool to this CPU."""
    os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
    try:
        import torch  # noqa: PLC0415  (lazy: only when a model needs torch)

        n = os.cpu_count() or 4
        torch.set_num_threads(n)
        try:
            torch.set_num_interop_threads(max(1, min(4, n // 2)))
        except Exception:  # interop tuning is optional
            pass
        log.info("torch threads=%d (CPU only)", n)
    except ImportError:
        log.info("torch not installed yet; CPU tuning deferred to model load")
    except Exception as exc:  # never break the bridge over thread tuning
        log.warning("torch thread config skipped: %s", exc)


# ---------------------------------------------------------------------------
# Reference voices (bundled refs, missing refs = clear error, never crash)
# ---------------------------------------------------------------------------

def detect_lang(text: str) -> str:
    """'ar' when more than a quarter of the letters are Arabic, else 'en'."""
    letters = arabic = 0
    for ch in text:
        if not ch.isalpha():
            continue
        letters += 1
        code = ord(ch)
        if (0x0600 <= code <= 0x06FF or 0x0750 <= code <= 0x077F
                or 0x08A0 <= code <= 0x08FF or 0xFB50 <= code <= 0xFDFF
                or 0xFE70 <= code <= 0xFEFF):
            arabic += 1
    return "ar" if letters and arabic / letters > 0.25 else "en"


# Short transcripts for reference clips generated from the OS voices. The
# model needs ref_text to match the clip word-for-word, so we choose the text.
_BOOTSTRAP_TEXT = {
    "ar": "مرحبا بكم في هذا العرض التقديمي. سنستعرض معا أهم النقاط الرئيسية.",
    "en": "Welcome to this presentation. Today we will walk through the key "
          "points together.",
}

# WinRT speech (not System.Speech): Windows PowerShell 5.1's System.Speech
# cannot see the OneCore voices (e.g. the Arabic "Microsoft Naayf"); WinRT
# lists every installed voice.
_BOOTSTRAP_PS1 = r"""
param([string]$Lang, [string]$Gender, [string]$TextFile, [string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    [void]$task.Wait(-1)
    $task.Result
}
$all = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices)
$pool = @($all | Where-Object { $_.Language -like "$Lang*" })
if ($pool.Count -eq 0) { exit 3 }
$pick = $pool | Where-Object { $_.Gender.ToString() -ieq $Gender } | Select-Object -First 1
if (-not $pick) { $pick = $pool[0] }
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$synth.Voice = $pick
$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
$stream = Await ($synth.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$reader = New-Object Windows.Storage.Streams.DataReader($stream)
[void](Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32]))
$bytes = New-Object byte[] ([int]$stream.Size)
$reader.ReadBytes($bytes)
[System.IO.File]::WriteAllBytes($Out, $bytes)
"""


def bootstrap_ref(voice: str) -> str:
    """Generate a reference clip with the OS speech engine (Windows).

    Used only when no recorded reference voice is available, so narration
    works out of the box. Dropping `<name>.wav` + `<name>.txt` into the
    voices folder replaces it. Returns the wav path or raises
    FileNotFoundError with instructions.
    """
    stem = os.path.splitext(os.path.basename(voice))[0].lower()
    lang = "ar" if stem.startswith("ar") else "en"
    gender = "Female" if "female" in stem else "Male" if "male" in stem else "Female"
    out_dir = os.path.join(VOICES_DIR, "_generated")
    wav_path = os.path.join(out_dir, stem + ".wav")
    txt_path = os.path.join(out_dir, stem + ".txt")
    if sys.platform != "win32":
        raise FileNotFoundError(
            f"reference voice '{voice}' not found. Add {stem}.wav and "
            f"{stem}.txt (exact transcript, under 10 s) to {VOICES_DIR}.")
    os.makedirs(out_dir, exist_ok=True)
    with open(txt_path, "w", encoding="utf-8") as fh:
        fh.write(_BOOTSTRAP_TEXT[lang])
    ps1 = os.path.join(out_dir, "_bootstrap.ps1")
    with open(ps1, "w", encoding="utf-8-sig") as fh:
        fh.write(_BOOTSTRAP_PS1)
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
         "Bypass", "-File", ps1, "-Lang", lang, "-Gender", gender,
         "-TextFile", txt_path, "-Out", wav_path],
        capture_output=True, text=True, timeout=90,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if proc.returncode == 3:
        raise FileNotFoundError(
            f"No {'Arabic' if lang == 'ar' else 'English'} system voice is "
            f"installed to build a reference clip. Add {stem}.wav and "
            f"{stem}.txt (exact transcript, under 10 s) to {VOICES_DIR}.")
    if (proc.returncode != 0 or not os.path.isfile(wav_path)
            or os.path.getsize(wav_path) < 4096):
        raise FileNotFoundError(
            f"Could not build the reference voice '{voice}': "
            f"{(proc.stderr or proc.stdout).strip()[:200]}")
    log.info("generated reference voice %s from the system voices", wav_path)
    return wav_path


def _ref_search_dirs() -> list[str]:
    return [d for d in (VOICES_DIR, REFS_DIR,
                        os.path.join(VOICES_DIR, "_generated")) if d]


def resolve_ref(voice: str, text: str = "") -> tuple[str, str]:
    """Resolve *voice* (ref filename or 'auto') -> (wav_path, transcript).

    'auto' / empty picks the default clip for the text's language. Search
    order: a path as given, the user's voices folder, the bundled
    tts-refs, previously generated clips, then a fresh clip generated from
    the OS voices. Raises FileNotFoundError / ValueError with an actionable
    message (bridge keeps running).
    """
    name = (voice or "").strip()
    if not name or name.lower() == "auto":
        name = "ar-female.wav" if detect_lang(text) == "ar" else "en-neutral.wav"
    base = os.path.basename(name)
    stem_name = base if base.lower().endswith(".wav") else base + ".wav"

    def has_pair(wav: str) -> bool:
        return os.path.isfile(wav) and os.path.isfile(os.path.splitext(wav)[0] + ".txt")

    candidates = [name] + [os.path.join(d, stem_name) for d in _ref_search_dirs()]
    wav_path = next((c for c in candidates if c and has_pair(c)), "")
    if not wav_path:
        wav_path = bootstrap_ref(stem_name)
    txt_path = os.path.splitext(wav_path)[0] + ".txt"
    with open(txt_path, encoding="utf-8") as fh:
        ref_text = fh.read().strip()
    if not ref_text:
        raise ValueError(f"reference transcript is empty: {txt_path}")
    return wav_path, ref_text


# ---------------------------------------------------------------------------
# Lazy model loaders (import ONLY on first use per model)
# ---------------------------------------------------------------------------

def _ensure_text_normalizer() -> bool:
    """Make `nemo_text_processing` importable; True when it is a stand-in.

    silma-tts imports NeMo's text normaliser at module load, and NeMo needs
    `pynini`, which has no Windows wheels (pip can never build it there). The
    normaliser only spells out numbers/abbreviations, so when the real one is
    unavailable a pass-through `Normalizer` is registered instead and
    synthesis proceeds on the text as written.
    """
    try:
        from nemo_text_processing.text_normalization.normalize import (  # noqa: PLC0415,F401
            Normalizer,
        )
        return False
    except Exception:  # ImportError, or pynini failing to load
        pass
    import types  # noqa: PLC0415

    class Normalizer:  # noqa: D401 - stand-in
        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        def normalize(self, text: str, *args: object, **kwargs: object) -> str:
            return text

    pkg = types.ModuleType("nemo_text_processing")
    sub = types.ModuleType("nemo_text_processing.text_normalization")
    leaf = types.ModuleType("nemo_text_processing.text_normalization.normalize")
    pkg.__path__ = []  # type: ignore[attr-defined]
    sub.__path__ = []  # type: ignore[attr-defined]
    leaf.Normalizer = Normalizer  # type: ignore[attr-defined]
    sys.modules["nemo_text_processing"] = pkg
    sys.modules["nemo_text_processing.text_normalization"] = sub
    sys.modules["nemo_text_processing.text_normalization.normalize"] = leaf
    log.warning("nemo_text_processing unavailable; numbers are read as written")
    return True


def _patch_torchaudio_load() -> None:
    """Read audio with soundfile instead of torchaudio's torchcodec path.

    torchaudio >= 2.9 decodes through torchcodec, which needs *shared* FFmpeg
    DLLs that most Windows installs (a static ffmpeg.exe, winget's link) do
    not have, so SILMA's `torchaudio.load(ref_audio)` raised "Could not load
    libtorchcodec". Reference clips are plain WAV; soundfile reads them.
    Anything soundfile cannot read still goes to the original loader.
    """
    try:
        import soundfile as sf  # noqa: PLC0415
        import torch  # noqa: PLC0415
        import torchaudio  # noqa: PLC0415
    except ImportError:
        return
    original = getattr(torchaudio, "load", None)

    def load(uri, frame_offset=0, num_frames=-1, normalize=True,  # type: ignore[no-untyped-def]
             channels_first=True, *args, **kwargs):
        try:
            data, rate = sf.read(str(uri), dtype="float32", always_2d=True,
                                 start=frame_offset, frames=num_frames)
        except Exception:
            if original is None:
                raise
            return original(uri, frame_offset, num_frames, normalize,
                            channels_first, *args, **kwargs)
        tensor = torch.from_numpy(data)  # (frames, channels)
        return (tensor.t().contiguous() if channels_first else tensor), rate

    torchaudio.load = load


def load_silma(models_dir: str) -> object:
    """Load SILMA TTS v1 (default bilingual AR/EN). Thread-safe singleton."""
    with _MODELS_LOCK:
        if "silma" not in _MODELS:
            os.environ.setdefault("HF_HOME", models_dir)
            os.environ.setdefault("HUGGINGFACE_HUB_CACHE", models_dir)
            try:
                _ensure_text_normalizer()
                _patch_torchaudio_load()
                from silma_tts.api import SilmaTTS  # noqa: PLC0415
            except ImportError as exc:
                raise RuntimeError(
                    "silma-tts package not installed in the TTS venv. "
                    "Install app/src-tauri/resources/requirements-tts-silma.txt "
                    f"into the managed venv. ({exc})"
                ) from exc
            # SilmaTTS hard-codes `hf://silma-ai/silma-tts/<file>` and would
            # download its own copy of the 2+ GB checkpoint. Serve the files
            # the app already downloaded (models/silma/) instead.
            try:
                import silma_tts.api as silma_api  # noqa: PLC0415

                local_dir = os.path.join(models_dir, "silma")
                original = silma_api.cached_path

                def local_first(url, *args, **kwargs):  # type: ignore[no-untyped-def]
                    prefix = "hf://silma-ai/silma-tts/"
                    if isinstance(url, str) and url.startswith(prefix):
                        local = os.path.join(local_dir, url[len(prefix):])
                        if os.path.isfile(local):
                            return local
                    return original(url, *args, **kwargs)

                silma_api.cached_path = local_first
            except Exception as exc:  # shim is an optimisation only
                log.warning("SILMA local-weights shim skipped: %s", exc)
            try:
                set_progress("loading", message="Loading the SILMA voice model "
                             "(first use can take a few minutes)…")
                _MODELS["silma"] = SilmaTTS()
            except Exception as exc:
                raise RuntimeError(f"SILMA model init failed: {exc}") from exc
            log.info("SILMA model loaded (weights under %s)", models_dir)
        return _MODELS["silma"]


def load_lahgtna(models_dir: str) -> object:
    """Load Lahgtna-Chatterbox (dialects). Isolated so drift never breaks SILMA."""
    with _MODELS_LOCK:
        if "lahgtna" not in _MODELS:
            os.environ.setdefault("HF_HOME", models_dir)
            os.environ.setdefault("HUGGINGFACE_HUB_CACHE", models_dir)
            try:
                from chatterbox.mtl_tts import (  # noqa: PLC0415
                    ChatterboxMultilingualTTS,
                )
            except ImportError as exc:
                raise RuntimeError(
                    "chatterbox-tts package not installed in the TTS venv. "
                    "Install app/src-tauri/resources/requirements-tts-lahgtna.txt "
                    f"into the managed venv. ({exc})"
                ) from exc
            try:
                set_progress("loading", message="Loading the Lahgtna voice "
                             "model (first use can take a few minutes)…")
                # The app downloads the repo into models/lahgtna/; from_local
                # reads exactly those files (from_pretrained() would fetch
                # the base English-only weights instead).
                _MODELS["lahgtna"] = ChatterboxMultilingualTTS.from_local(
                    os.path.join(models_dir, "lahgtna"), "cpu"
                )
            except Exception as exc:
                raise RuntimeError(
                    "Lahgtna weights/load failed (upstream API may have drifted; "
                    "SILMA default is unaffected). "
                    "See requirements-tts-lahgtna.txt notes. "
                    f"({exc})"
                ) from exc
            log.info("Lahgtna-Chatterbox model loaded")
        return _MODELS["lahgtna"]


def load_kokoro(models_dir: str) -> object:
    """Load Kokoro-82M (fast English). Lazy so EN-only dep stays optional."""
    with _MODELS_LOCK:
        if "kokoro" not in _MODELS:
            os.environ.setdefault("HF_HOME", models_dir)
            os.environ.setdefault("HUGGINGFACE_HUB_CACHE", models_dir)
            try:
                from kokoro import KPipeline  # noqa: PLC0415
            except ImportError as exc:
                raise RuntimeError(
                    "kokoro package not installed in the TTS venv. "
                    "Install app/src-tauri/resources/requirements-tts-kokoro.txt "
                    f"into the managed venv (plus espeak-ng system lib). ({exc})"
                ) from exc
            try:
                set_progress("loading", message="Loading the Kokoro voice…")
                kdir = os.path.join(models_dir, "kokoro")
                config = os.path.join(kdir, "config.json")
                weights = os.path.join(kdir, "kokoro-v1_0.pth")
                pipeline = None
                if os.path.isfile(config) and os.path.isfile(weights):
                    try:  # use the weights the app downloaded
                        from kokoro import KModel  # noqa: PLC0415

                        pipeline = KPipeline(
                            lang_code="a",
                            model=KModel(config=config, model=weights))
                    except Exception as exc:
                        log.warning("Kokoro local weights skipped: %s", exc)
                _MODELS["kokoro"] = pipeline or KPipeline(lang_code="a")
            except Exception as exc:
                raise RuntimeError(f"Kokoro pipeline init failed: {exc}") from exc
            log.info("Kokoro-82M pipeline loaded")
        return _MODELS["kokoro"]


_LOADERS = {"silma": load_silma, "lahgtna": load_lahgtna, "kokoro": load_kokoro}


# ---------------------------------------------------------------------------
# Per-chunk synthesis dispatch
# ---------------------------------------------------------------------------

def synthesize_chunk(model_id: str, model: object, chunk: str,
                     ref_wav: str, ref_text: str, speed: float,
                     tmp_wav: str) -> None:
    """Synthesize one *chunk* to *tmp_wav* (any sample rate; joined later)."""
    if model_id == "silma":
        # Contract entry: SilmaTTS.infer(ref_file, ref_text, gen_text,
        # file_wave, speed). Keyword call; on drift surface a clear error.
        infer = getattr(model, "infer", None)
        if infer is None:
            raise RuntimeError("SILMA backend has no .infer() (API drift?)")
        try:
            infer(ref_file=ref_wav, ref_text=ref_text,
                  gen_text=chunk, file_wave=tmp_wav, speed=speed)
        except TypeError as exc:
            raise RuntimeError(
                f"SILMA .infer() signature drifted: {exc}. Pin silma-tts per "
                "requirements-tts-silma.txt."
            ) from exc
    elif model_id == "lahgtna":
        generate = getattr(model, "generate", None)
        if generate is None:
            raise RuntimeError("Lahgtna backend has no .generate() (API drift?)")
        import inspect  # noqa: PLC0415
        import numpy as np  # noqa: PLC0415
        import torch  # noqa: PLC0415 (chatterbox stack always has torch)

        # language_id is a required argument of the multilingual model; the
        # voice name may carry a dialect (ar-eg.wav -> "eg").
        kwargs: dict[str, object] = {}
        if ref_wav:
            kwargs["audio_prompt_path"] = ref_wav
        if "language_id" in inspect.signature(generate).parameters:
            dialect = os.path.splitext(os.path.basename(ref_wav or ""))[0]
            dialect = dialect.split("-")[-1].lower()
            kwargs["language_id"] = DIALECT_TO_CHATTERBOX_LANG.get(dialect, "ar")
        wav = generate(chunk, **kwargs)
        if isinstance(wav, dict):
            wav = wav.get("wav", wav.get("audio", wav))
        if torch.is_tensor(wav):
            wav = wav.detach().cpu()
        arr = np.asarray(wav).flatten()
        _write_mono_wav(tmp_wav, arr, int(getattr(model, "sr", SAMPLE_RATE)))
    elif model_id == "kokoro":
        import numpy as np  # noqa: PLC0415

        voice_pt = os.path.join(MODELS_DIR, "kokoro", "voices", "af_heart.pt")
        voice_name = voice_pt if os.path.isfile(voice_pt) else "af_heart"
        parts: list = []
        for _, _, audio in model(chunk, voice=voice_name):  # type: ignore[misc]
            parts.append(np.asarray(audio).flatten())
        if not parts:
            raise RuntimeError("Kokoro returned no audio for chunk")
        _write_mono_wav(tmp_wav, np.concatenate(parts), SAMPLE_RATE)
    else:  # unreachable (validated upstream) — defensive only
        raise ValueError(f"unknown modelId: {model_id}")


def _write_mono_wav(path: str, samples: object, rate: int) -> None:
    """Write float32 mono *samples* (numpy) as 16-bit PCM WAV."""
    import numpy as np  # noqa: PLC0415

    arr = np.asarray(samples, dtype=np.float32).flatten()
    pcm = (np.clip(arr, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm)


# ---------------------------------------------------------------------------
# WAV normalize + join (stdlib only: wave + struct, no ffmpeg/numpy needed)
# ---------------------------------------------------------------------------

def _read_as_mono_24k(path: str) -> bytes:
    """Read *path* and return raw int16-mono-24k frames (resample if needed)."""
    with wave.open(path, "rb") as wf:
        nch, width, rate, nframes = (wf.getnchannels(), wf.getsampwidth(),
                                    wf.getframerate(), wf.getnframes())
        raw = wf.readframes(nframes)
    if nch == 1 and width == 2 and rate == SAMPLE_RATE:
        return raw  # already the target format: no per-sample work
    if width == 1:  # 8-bit unsigned
        samples = [(b - 128) * 256 for b in raw]
    elif width == 2:
        samples = list(struct.unpack(f"<{len(raw) // 2}h", raw))
    elif width == 4:  # 32-bit signed -> high 16 bits
        ints = struct.unpack(f"<{len(raw) // 4}i", raw)
        samples = [v >> 16 for v in ints]
    else:
        raise ValueError(f"unsupported sample width {width * 8}-bit in {path}")
    if nch > 1:  # stereo+ -> mono mean (Tashkeel-agnostic, pure PCM math)
        mono = [sum(samples[i * nch:(i + 1) * nch]) // nch
                for i in range(len(samples) // nch)]
    else:
        mono = samples
    if rate != SAMPLE_RATE and mono:
        # Linear-interpolation resample (fallback path; models already 24k).
        ratio = SAMPLE_RATE / rate
        new_len = int(len(mono) * ratio)
        res = []
        for i in range(new_len):
            pos = i / ratio
            lo = int(pos)
            hi = min(lo + 1, len(mono) - 1)
            frac = pos - lo
            res.append(int(mono[lo] * (1 - frac) + mono[hi] * frac))
        mono = res
    return struct.pack(f"<{len(mono)}h", *mono) if mono else b""


def join_wavs(chunk_paths: list[str], out_path: str) -> int:
    """Join chunk WAVs into one 24k-mono WAV. Returns duration in ms."""
    frames = b"".join(_read_as_mono_24k(p) for p in chunk_paths)
    # Write beside the target and rename, so a reader (the Rust cache lookup,
    # the player) never sees a half-written WAV.
    part = out_path + ".part"
    with wave.open(part, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(frames)
    os.replace(part, out_path)
    return int(len(frames) / 2 / SAMPLE_RATE * 1000)


# ---------------------------------------------------------------------------
# HTTP layer (loopback only)
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "YzPzCode-TTSBridge/" + BRIDGE_VERSION

    def log_message(self, fmt: str, *args: object) -> None:  # noqa: D102
        log.info("%s - %s", self.address_string(), fmt % args)

    # -- helpers ---------------------------------------------------------
    def _send_json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValueError(f"invalid JSON body: {exc}") from exc

    # -- routes ----------------------------------------------------------
    def do_GET(self) -> None:  # noqa: D102
        path = self.path.split("?", 1)[0]
        if path == "/health":
            with _MODELS_LOCK:
                loaded = sorted(_MODELS.keys())
            self._send_json(200, {"ok": True, "version": BRIDGE_VERSION,
                                  "loadedModels": loaded})
        elif path == "/progress":
            self._send_json(200, get_progress())
        elif path == "/":
            self._send_json(200, {"ok": True, "service": "yzpzcode-tts-bridge",
                                  "version": BRIDGE_VERSION,
                                  "models": list(MODEL_IDS)})
        else:
            self._send_json(404, {"ok": False, "error": f"unknown path {path}"})

    def do_POST(self) -> None:  # noqa: D102
        path = self.path.split("?", 1)[0]
        if path == "/cancel":
            _CANCEL_EVENT.set()
            self._send_json(200, {"ok": True, "cancelled": True})
            return
        if path != "/synthesize":
            self._send_json(404, {"ok": False,
                                  "error": f"unknown path {path}"})
            return
        try:
            payload = self._read_json()
        except ValueError as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
            return
        self._handle_synthesize(payload)

    # -- /synthesize -----------------------------------------------------
    def _handle_synthesize(self, payload: dict) -> None:
        model_id = str(payload.get("modelId", "")).lower()
        text = payload.get("text", "")
        voice = str(payload.get("voice") or "auto")
        requested_out = payload.get("outPath")
        try:
            speed = float(payload.get("speed", 1.0))
        except (TypeError, ValueError):
            self._send_json(400, {"ok": False,
                                  "error": "speed must be 0.75, 1 or 1.25"})
            return

        if model_id not in MODEL_IDS:
            self._send_json(400, {"ok": False,
                                  "error": f"modelId must be one of "
                                           f"{list(MODEL_IDS)}"})
            return
        if not isinstance(text, str) or not text.strip():
            self._send_json(400, {"ok": False,
                                  "error": "text must be a non-empty string"})
            return
        if len(text) > MAX_TEXT_CHARS:
            self._send_json(400, {
                "ok": False,
                "error": f"text too long ({len(text)} > {MAX_TEXT_CHARS} chars); "
                         "split client-side and synthesize per section"})
            return
        if not any(abs(speed - s) < 1e-6 for s in ALLOWED_SPEEDS):
            self._send_json(400, {"ok": False,
                                  "error": f"speed must be one of "
                                           f"{list(ALLOWED_SPEEDS)}"})
            return

        if not _SYNTH_LOCK.acquire(blocking=False):
            self._send_json(409, {"ok": False,
                                  "error": "synthesis already in progress; "
                                           "POST /cancel first"})
            return
        try:
            self._run_synthesis(model_id, text, voice, speed, requested_out)
        finally:
            set_progress("idle")
            _SYNTH_LOCK.release()

    def _run_synthesis(self, model_id: str, text: str, voice: str,
                       speed: float, requested_out: object = None) -> None:
        _CANCEL_EVENT.clear()
        set_progress("loading", message="Preparing…")

        # WAV cache: instant replay on identical (model|voice|speed|text).
        # The supervisor names the file (outPath) so its own cache lookup and
        # this one agree; it must stay inside the cache directory.
        out_path = os.path.join(
            CACHE_DIR, cache_key(model_id, voice, speed, text) + ".wav")
        if isinstance(requested_out, str) and requested_out:
            cand = os.path.abspath(requested_out)
            if (os.path.dirname(cand) == os.path.abspath(CACHE_DIR)
                    and cand.lower().endswith(".wav")):
                out_path = cand
        if os.path.isfile(out_path):
            try:
                with wave.open(out_path, "rb") as wf:
                    dur = int(wf.getnframes() / wf.getframerate() * 1000)
                self._send_json(200, {"ok": True, "wavPath": out_path,
                                      "durationMs": dur, "cached": True,
                                      "chunks": 0})
                return
            except wave.Error:  # corrupt cache entry -> re-synthesize
                log.warning("corrupt cache entry %s; re-synthesizing", out_path)

        # SILMA clones a reference voice, so it needs one. Lahgtna can fall
        # back to its built-in voice and Kokoro has fixed voices.
        ref_wav, ref_text = "", ""
        if model_id != "kokoro":
            try:
                set_progress("loading", message="Preparing the voice…")
                ref_wav, ref_text = resolve_ref(voice, text)
            except (FileNotFoundError, ValueError, OSError,
                    subprocess.SubprocessError) as exc:
                if model_id == "silma":
                    self._send_json(400, {"ok": False, "error": str(exc)})
                    return
                log.warning("no reference voice (%s); using the built-in one",
                            exc)

        try:
            model = _LOADERS[model_id](MODELS_DIR)
        except RuntimeError as exc:
            self._send_json(503, {"ok": False, "error": str(exc)})
            return
        except Exception as exc:  # import/init failure -> clear 503, no crash
            log.exception("model %s failed to load", model_id)
            self._send_json(503, {"ok": False,
                                  "error": f"{model_id} failed to load: {exc}"})
            return

        chunks = split_text(text)
        log.info("synthesize model=%s voice=%s speed=%s chunks=%d chars=%d",
                 model_id, voice, speed, len(chunks), len(text))
        tmp_dir = os.path.join(CACHE_DIR, ".tmp")
        os.makedirs(tmp_dir, exist_ok=True)
        tmp_paths: list[str] = []
        try:
            for i, chunk in enumerate(chunks):
                if _CANCEL_EVENT.is_set():
                    self._send_json(409, {"ok": False, "cancelled": True,
                                          "error": "synthesis cancelled"})
                    return
                set_progress("synthesizing", i, len(chunks),
                             f"Synthesizing {i + 1} of {len(chunks)}…")
                fd, tmp = tempfile.mkstemp(prefix=f"tts-c{i}-", suffix=".wav",
                                           dir=tmp_dir)
                os.close(fd)
                tmp_paths.append(tmp)
                try:
                    synthesize_chunk(model_id, model, chunk,
                                     ref_wav, ref_text, speed, tmp)
                except Exception as exc:  # model error -> clear 500, no crash
                    log.exception("chunk %d/%d failed", i + 1, len(chunks))
                    self._send_json(500, {
                        "ok": False,
                        "error": f"{model_id} synthesis failed on chunk "
                                 f"{i + 1}/{len(chunks)}: {exc}"})
                    return
            if _CANCEL_EVENT.is_set():
                self._send_json(409, {"ok": False, "cancelled": True,
                                      "error": "synthesis cancelled"})
                return
            set_progress("joining", len(chunks), len(chunks), "Finishing…")
            duration_ms = join_wavs(tmp_paths, out_path)
            log.info("wrote %s (%d ms)", out_path, duration_ms)
            self._send_json(200, {"ok": True, "wavPath": out_path,
                                  "durationMs": duration_ms, "cached": False,
                                  "chunks": len(chunks)})
        finally:
            for tmp in tmp_paths:
                try:
                    if os.path.abspath(tmp) != os.path.abspath(out_path):
                        os.unlink(tmp)
                except OSError:
                    pass


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """CLI matching the Rust spawn contract (loopback bind enforced)."""
    parser = argparse.ArgumentParser(
        description="YzPzCode local TTS bridge: loopback HTTP synthesis "
                    f"for {', '.join(MODEL_IDS)} (24kHz mono WAV out).")
    parser.add_argument("--port", type=int, required=True,
                        help="loopback port to bind (Rust picks a free "
                             "127.0.0.1 port)")
    parser.add_argument("--host", default="127.0.0.1",
                        help="bind host; MUST be loopback "
                             "(127.0.0.1/::1/localhost, default 127.0.0.1); "
                             "0.0.0.0 is refused)")
    parser.add_argument("--models-dir", default="tts-models",
                        help="weights dir (default: ./tts-models; Rust passes "
                             "<appData>/tts-models)")
    parser.add_argument("--cache-dir", default="tts-cache",
                        help="WAV cache dir (default: ./tts-cache; Rust passes "
                             "<appData>/tts-cache)")
    parser.add_argument("--voices-dir", default="tts-voices",
                        help="user reference voices (<name>.wav + <name>.txt); "
                             "Rust passes <appData>/tts/voices")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Bind loopback and serve until killed by the Rust supervisor."""
    logging.basicConfig(stream=sys.stderr, level=logging.INFO,
                        format="%(asctime)s [tts_bridge] %(levelname)s: "
                               "%(message)s")
    args = parse_args(argv)
    if args.host not in ALLOWED_HOSTS:
        print(f"refusing non-loopback bind host '{args.host}' "
              f"(allowed: {list(ALLOWED_HOSTS)}); aborting",
              file=sys.stderr)
        return 2

    global MODELS_DIR, CACHE_DIR, REFS_DIR, VOICES_DIR
    MODELS_DIR = os.path.abspath(args.models_dir)
    CACHE_DIR = os.path.abspath(args.cache_dir)
    VOICES_DIR = os.path.abspath(args.voices_dir)
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(CACHE_DIR, exist_ok=True)
    os.makedirs(VOICES_DIR, exist_ok=True)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    REFS_DIR = os.path.join(script_dir, "tts-refs")
    if not os.path.isdir(REFS_DIR):
        log.warning("bundled refs dir missing: %s (voices will 400 until "
                    "tts-refs/ ships ar-male/female + en-neutral wavs)",
                    REFS_DIR)

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    log.info("TTS bridge v%s up on http://%s:%d (models=%s, cache=%s)",
             BRIDGE_VERSION, args.host, args.port, MODELS_DIR, CACHE_DIR)
    # `import torch` can take many seconds on Windows. Do it after the socket
    # is bound so the supervisor's health probe is answered immediately.
    os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
    threading.Thread(target=configure_cpu_threads, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
