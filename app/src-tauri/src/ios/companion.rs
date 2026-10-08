//! idb_companion: the process that talks to a booted simulator's framebuffer
//! and HID (through Apple's private SimulatorKit), served over gRPC.
//!
//! `simctl` alone can boot, shut down and screenshot a simulator, but has no
//! touch input and no live video, so the embedded screen needs the companion
//! (`brew install facebook/fb/idb-companion`).

use std::path::PathBuf;
use std::process::Stdio;
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;
use tonic::client::Grpc;
use tonic::codec::{ProstCodec, Streaming};
use tonic::codegen::http::uri::PathAndQuery;
use tonic::transport::{Channel, Endpoint};
use tonic::{Request, Status};

use super::proto::{self, SERVICE};

const MAX_MESSAGE_BYTES: usize = 32 * 1024 * 1024;
const START_TIMEOUT: Duration = Duration::from_secs(30);

/// Where Homebrew puts idb_companion, for apps started without a login PATH.
const KNOWN_LOCATIONS: [&str; 3] = [
    "/opt/homebrew/bin/idb_companion",
    "/usr/local/bin/idb_companion",
    "/opt/homebrew/opt/idb-companion/bin/idb_companion",
];

pub fn companion_path() -> Option<PathBuf> {
    which::which("idb_companion").ok().or_else(|| {
        KNOWN_LOCATIONS
            .iter()
            .map(PathBuf::from)
            .find(|p| p.is_file())
    })
}

fn path(method: &str) -> PathAndQuery {
    PathAndQuery::try_from(format!("{SERVICE}/{method}")).expect("valid gRPC path")
}

#[derive(Clone)]
pub struct CompanionClient {
    channel: Channel,
}

impl CompanionClient {
    pub async fn connect(port: u16) -> Result<Self, String> {
        let channel = Endpoint::from_shared(format!("http://127.0.0.1:{port}"))
            .map_err(|e| e.to_string())?
            .connect_timeout(Duration::from_secs(3))
            .tcp_nodelay(true)
            .connect()
            .await
            .map_err(|e| format!("Could not reach idb_companion on port {port}: {e}"))?;
        Ok(Self { channel })
    }

    async fn grpc(&self) -> Result<Grpc<Channel>, Status> {
        let mut grpc = Grpc::new(self.channel.clone())
            .max_decoding_message_size(MAX_MESSAGE_BYTES)
            .max_encoding_message_size(MAX_MESSAGE_BYTES);
        grpc.ready()
            .await
            .map_err(|e| Status::unavailable(e.to_string()))?;
        Ok(grpc)
    }

    pub async fn describe(&self) -> Result<proto::TargetDescription, Status> {
        let mut grpc = self.grpc().await?;
        let codec: ProstCodec<proto::TargetDescriptionRequest, proto::TargetDescriptionResponse> =
            ProstCodec::default();
        let response = grpc
            .unary(
                Request::new(proto::TargetDescriptionRequest::default()),
                path("describe"),
                codec,
            )
            .await?
            .into_inner();
        response
            .target_description
            .ok_or_else(|| Status::internal("idb_companion described no target"))
    }

    /// Sends HID events as one client stream. The companion performs them in
    /// order (delays included) once the stream ends.
    pub async fn hid(&self, events: Vec<proto::HidEvent>) -> Result<(), Status> {
        let mut grpc = self.grpc().await?;
        let codec: ProstCodec<proto::HidEvent, proto::HidResponse> = ProstCodec::default();
        grpc.client_streaming(Request::new(tokio_stream::iter(events)), path("hid"), codec)
            .await?;
        Ok(())
    }

    pub async fn set_orientation(
        &self,
        orientation: proto::HidOrientationType,
    ) -> Result<(), Status> {
        let mut grpc = self.grpc().await?;
        let codec: ProstCodec<proto::SetOrientationRequest, proto::SetOrientationResponse> =
            ProstCodec::default();
        grpc.unary(
            Request::new(proto::SetOrientationRequest {
                orientation: orientation as i32,
            }),
            path("set_orientation"),
            codec,
        )
        .await?;
        Ok(())
    }

    /// Starts an MJPEG video stream. The request stream stays open while
    /// `control` lives; dropping it ends the stream.
    pub async fn video_stream(
        &self,
        start: proto::VideoStreamStart,
    ) -> Result<
        (
            tokio::sync::mpsc::Sender<proto::VideoStreamRequest>,
            Streaming<proto::VideoStreamResponse>,
        ),
        Status,
    > {
        let mut grpc = self.grpc().await?;
        let (control, requests) = tokio::sync::mpsc::channel(4);
        control
            .send(proto::VideoStreamRequest {
                control: Some(proto::VideoControl::Start(start)),
            })
            .await
            .map_err(|_| Status::internal("video control closed"))?;
        let codec: ProstCodec<proto::VideoStreamRequest, proto::VideoStreamResponse> =
            ProstCodec::default();
        let responses = grpc
            .streaming(
                Request::new(tokio_stream::wrappers::ReceiverStream::new(requests)),
                path("video_stream"),
                codec,
            )
            .await?
            .into_inner();
        Ok((control, responses))
    }
}

/// A companion process serving one simulator.
pub struct Companion {
    pub child: Child,
    pub port: u16,
    pub client: CompanionClient,
}

fn free_port() -> Result<u16, String> {
    std::net::TcpListener::bind(("127.0.0.1", 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .map_err(|e| format!("No free local port: {e}"))
}

/// `{"grpc_port": 10882, ...}`, the line the companion prints once it serves.
pub fn parse_ready_line(line: &str) -> Option<u16> {
    let value: serde_json::Value = serde_json::from_str(line.trim()).ok()?;
    value.get("grpc_port")?.as_u64()?.try_into().ok()
}

impl Companion {
    pub async fn start(udid: &str) -> Result<Self, String> {
        let binary = companion_path().ok_or(
            "idb_companion is not installed. Install it from Flutter & iOS setup (Homebrew: brew install facebook/fb/idb-companion).",
        )?;
        let port = free_port()?;
        let mut child = tokio::process::Command::new(&binary)
            .args(["--udid", udid, "--grpc-port", &port.to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Could not start idb_companion: {e}"))?;
        let mut stdout = BufReader::new(child.stdout.take().expect("piped")).lines();
        let mut stderr = BufReader::new(child.stderr.take().expect("piped")).lines();
        let mut last_error = String::new();
        let deadline = Instant::now() + START_TIMEOUT;
        let ready_port = loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                let _ = child.start_kill();
                return Err(format!(
                    "idb_companion did not start in time{}",
                    if last_error.is_empty() {
                        String::new()
                    } else {
                        format!(": {last_error}")
                    }
                ));
            }
            tokio::select! {
                line = stdout.next_line() => match line {
                    Ok(Some(line)) => if let Some(port) = parse_ready_line(&line) { break port },
                    _ => {
                        let _ = child.start_kill();
                        return Err(format!(
                            "idb_companion exited{}",
                            if last_error.is_empty() { String::new() } else { format!(": {last_error}") }
                        ));
                    }
                },
                line = stderr.next_line() => {
                    if let Ok(Some(line)) = line {
                        let line = line.trim().to_string();
                        if !line.is_empty() {
                            last_error = line;
                        }
                    }
                },
                _ = tokio::time::sleep(remaining) => {}
            }
        };
        // Keep draining its output so the pipes never fill and block it.
        tokio::spawn(async move { while let Ok(Some(_)) = stdout.next_line().await {} });
        tokio::spawn(async move { while let Ok(Some(_)) = stderr.next_line().await {} });
        let client = CompanionClient::connect(ready_port)
            .await
            .inspect_err(|_| {
                let _ = child.start_kill();
            })?;
        Ok(Self {
            child,
            port: ready_port,
            client,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_ready_line() {
        assert_eq!(
            parse_ready_line(r#"{"grpc_swift_port":0,"grpc_port":10882}"#),
            Some(10882)
        );
        assert_eq!(parse_ready_line("starting companion"), None);
    }
}
