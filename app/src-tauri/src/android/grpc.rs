//! A small client for the emulator's `EmulatorController` gRPC service.
//!
//! Uses tonic's generic client with prost messages from [`super::proto`], so
//! there is no generated code and no `protoc` build step.

use std::time::Duration;

use tonic::client::Grpc;
use tonic::codec::{ProstCodec, Streaming};
use tonic::codegen::http::uri::PathAndQuery;
use tonic::transport::{Channel, Endpoint};
use tonic::{Request, Status};

use super::proto::{self, SERVICE};

/// Screen frames are uncompressed RGB; a 1440×3120 display is ~13 MB.
const MAX_MESSAGE_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone)]
pub struct EmulatorClient {
    channel: Channel,
    token: Option<String>,
}

fn path(method: &str) -> PathAndQuery {
    PathAndQuery::try_from(format!("{SERVICE}/{method}")).expect("valid gRPC path")
}

impl EmulatorClient {
    pub async fn connect(port: u16, token: Option<String>) -> Result<Self, String> {
        let channel = Endpoint::from_shared(format!("http://127.0.0.1:{port}"))
            .map_err(|e| e.to_string())?
            .connect_timeout(Duration::from_secs(3))
            .tcp_nodelay(true)
            .connect()
            .await
            .map_err(|e| format!("Could not reach the emulator on port {port}: {e}"))?;
        Ok(Self { channel, token })
    }

    fn request<T>(&self, message: T) -> Request<T> {
        let mut request = Request::new(message);
        if let Some(token) = &self.token {
            if let Ok(value) = format!("Bearer {token}").parse() {
                request.metadata_mut().insert("authorization", value);
            }
        }
        request
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

    async fn unary<Req, Res>(&self, method: &str, message: Req) -> Result<Res, Status>
    where
        Req: prost::Message + Send + Sync + 'static,
        Res: prost::Message + Default + Send + Sync + 'static,
    {
        let mut grpc = self.grpc().await?;
        let codec: ProstCodec<Req, Res> = ProstCodec::default();
        Ok(grpc
            .unary(self.request(message), path(method), codec)
            .await?
            .into_inner())
    }

    pub async fn status(&self) -> Result<proto::EmulatorStatus, Status> {
        self.unary("getStatus", proto::Empty {}).await
    }

    pub async fn screenshot(&self, format: proto::ImageFormat) -> Result<proto::Image, Status> {
        self.unary("getScreenshot", format).await
    }

    pub async fn stream_screenshot(
        &self,
        format: proto::ImageFormat,
    ) -> Result<Streaming<proto::Image>, Status> {
        let mut grpc = self.grpc().await?;
        let codec: ProstCodec<proto::ImageFormat, proto::Image> = ProstCodec::default();
        Ok(grpc
            .server_streaming(self.request(format), path("streamScreenshot"), codec)
            .await?
            .into_inner())
    }

    pub async fn send_touch(&self, event: proto::TouchEvent) -> Result<(), Status> {
        self.unary::<_, proto::Empty>("sendTouch", event).await?;
        Ok(())
    }

    pub async fn send_key(&self, event: proto::KeyboardEvent) -> Result<(), Status> {
        self.unary::<_, proto::Empty>("sendKey", event).await?;
        Ok(())
    }

    pub async fn set_physical_model(&self, value: proto::PhysicalModelValue) -> Result<(), Status> {
        self.unary::<_, proto::Empty>("setPhysicalModel", value)
            .await?;
        Ok(())
    }

    pub async fn set_vm_state(&self, state: i32) -> Result<(), Status> {
        self.unary::<_, proto::Empty>("setVmState", proto::VmRunState { state })
            .await?;
        Ok(())
    }

    pub async fn set_clipboard(&self, text: String) -> Result<(), Status> {
        self.unary::<_, proto::Empty>("setClipboard", proto::ClipData { text })
            .await?;
        Ok(())
    }
}
