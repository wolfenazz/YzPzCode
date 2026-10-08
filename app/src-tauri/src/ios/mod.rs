//! iOS Simulator support (macOS): simulator discovery and lifecycle through
//! `simctl`, and the embedded screen and input through idb_companion.
//! Everything compiles on every platform; off macOS the manager reports the
//! simulator as unavailable.

pub mod companion;
pub mod keys;
pub mod mjpeg;
pub mod proto;
pub mod setup;
pub mod simctl;
pub mod simulator;

pub use simulator::SimulatorManager;
