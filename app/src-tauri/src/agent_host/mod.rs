//! YZPZ Agent host manager.
//!
//! Owns the Node sidecar process (the Cline-SDK-based harness) and a WebSocket
//! client that talks the sidecar protocol. Sessions are scoped per workspace
//! and events are forwarded to the frontend over Tauri events.

mod manager;
mod protocol;

pub use manager::AgentHostManager;
pub use protocol::CreateAgentSessionRequest;
