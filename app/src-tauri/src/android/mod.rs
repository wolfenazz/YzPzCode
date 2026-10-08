//! Flutter and Android tooling: SDK discovery, the embedded emulator, the
//! Flutter run session, and environment setup.

pub mod avd;
pub mod emulator;
pub mod flutter;
pub mod frame_server;
pub mod grpc;
pub mod proto;
pub mod sdk;
pub mod setup;
pub mod skin;

pub use emulator::EmulatorManager;
pub use flutter::FlutterRunManager;
pub use setup::FlutterSetupManager;
