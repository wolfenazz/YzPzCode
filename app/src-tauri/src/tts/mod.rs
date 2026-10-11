//! Local text-to-speech narration backend (Task 1 of the local-TTS plan).
//!
//! Storage layout under `<appData>/tts/`:
//! - `venv/` — managed Python virtual environment
//! - `models/<modelId>/` — Hugging Face weight snapshots + `manifest.json`
//! - `cache/` — synthesized WAVs keyed by content hash (LRU, 500 MB cap)
//! - `bridge.log` — last bridge stderr
//!
//! The `tts_bridge.py` child process itself ships in Task 2; until then,
//! `synthesize` reports exactly that while env/model/cache commands work.

pub mod bridge;
pub mod cache;
pub mod env;
pub mod models;

pub use bridge::{SynthResult, TtsManager, TtsStatus};
pub use env::VenvInfo;
pub use models::{ModelStatus, TtsModelInfo};
