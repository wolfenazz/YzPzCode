//! Serves emulator screens to the page as MJPEG over loopback HTTP.
//!
//! Sending every frame through a Tauri channel costs an IPC round trip per
//! frame (on Windows a WebView2 custom-protocol request, serialized with all
//! other IPC), which capped the screen at ~15 fps. An `<img>` pointed at a
//! `multipart/x-mixed-replace` stream is decoded by the browser itself, off the
//! page's main thread, at whatever rate frames arrive.
//!
//! The server binds 127.0.0.1 on a random port; each stream is reachable only
//! through an unguessable per-stream token.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;

const BOUNDARY: &str = "yzpzframe";
const MAX_REQUEST_BYTES: usize = 4096;

pub type Frame = Option<Arc<Vec<u8>>>;

#[derive(Clone)]
pub struct FrameServer {
    port: u16,
    streams: Arc<Mutex<HashMap<String, watch::Receiver<Frame>>>>,
}

impl FrameServer {
    pub async fn start() -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .map_err(|e| format!("Could not start the screen server: {e}"))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let server = Self {
            port,
            streams: Arc::default(),
        };
        let streams = server.streams.clone();
        tokio::spawn(async move {
            while let Ok((socket, _)) = listener.accept().await {
                let streams = streams.clone();
                tokio::spawn(async move {
                    let _ = serve(socket, streams).await;
                });
            }
        });
        Ok(server)
    }

    /// Registers a stream; frames sent on the returned sender reach every
    /// viewer of the returned URL. Dropping the sender ends the HTTP response.
    pub fn register(&self) -> (String, String, watch::Sender<Frame>) {
        let token = uuid::Uuid::new_v4().simple().to_string();
        let (tx, rx) = watch::channel::<Frame>(None);
        self.streams.lock().unwrap().insert(token.clone(), rx);
        let url = format!("http://127.0.0.1:{}/stream/{token}", self.port);
        (token, url, tx)
    }

    pub fn unregister(&self, token: &str) {
        self.streams.lock().unwrap().remove(token);
    }
}

async fn serve(
    mut socket: TcpStream,
    streams: Arc<Mutex<HashMap<String, watch::Receiver<Frame>>>>,
) -> std::io::Result<()> {
    let mut request = Vec::with_capacity(512);
    let mut buffer = [0u8; 1024];
    let head_complete = |data: &[u8]| data.windows(4).any(|w| w == b"\r\n\r\n");
    while !head_complete(&request) {
        let read = tokio::time::timeout(Duration::from_secs(5), socket.read(&mut buffer))
            .await
            .map_err(|_| std::io::Error::from(std::io::ErrorKind::TimedOut))??;
        if read == 0 || request.len() + read > MAX_REQUEST_BYTES {
            return Ok(());
        }
        request.extend_from_slice(&buffer[..read]);
    }
    let receiver =
        parse_token(&request).and_then(|token| streams.lock().unwrap().get(token).cloned());
    let Some(mut frames) = receiver else {
        socket
            .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .await?;
        return Ok(());
    };
    socket.set_nodelay(true)?;
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: multipart/x-mixed-replace; boundary={BOUNDARY}\r\n\
         Cache-Control: no-store\r\nPragma: no-cache\r\nConnection: close\r\n\r\n--{BOUNDARY}\r\n"
    );
    socket.write_all(head.as_bytes()).await?;
    // The current frame first, so a reconnecting viewer is never blank.
    let mut next = frames.borrow_and_update().clone();
    loop {
        if let Some(jpeg) = next.take() {
            // Each part ends with the next boundary: browsers show a part only
            // once its terminating boundary arrives.
            let part = format!(
                "Content-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n",
                jpeg.len()
            );
            socket.write_all(part.as_bytes()).await?;
            socket.write_all(&jpeg).await?;
            socket
                .write_all(format!("\r\n--{BOUNDARY}\r\n").as_bytes())
                .await?;
        }
        if frames.changed().await.is_err() {
            return Ok(());
        }
        next = frames.borrow_and_update().clone();
    }
}

/// The token from `GET /stream/<token> HTTP/1.1`.
fn parse_token(request: &[u8]) -> Option<&str> {
    let line = std::str::from_utf8(request).ok()?.lines().next()?;
    let mut parts = line.split(' ');
    if parts.next()? != "GET" {
        return None;
    }
    let token = parts.next()?.strip_prefix("/stream/")?;
    let token = token.split(['?', '#']).next()?;
    (!token.is_empty() && token.chars().all(|c| c.is_ascii_alphanumeric())).then_some(token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_only_well_formed_stream_requests() {
        assert_eq!(
            parse_token(b"GET /stream/abc123 HTTP/1.1\r\n\r\n"),
            Some("abc123")
        );
        assert_eq!(
            parse_token(b"GET /stream/abc123?r=2 HTTP/1.1\r\n\r\n"),
            Some("abc123")
        );
        assert_eq!(parse_token(b"POST /stream/abc HTTP/1.1\r\n\r\n"), None);
        assert_eq!(parse_token(b"GET /other/abc HTTP/1.1\r\n\r\n"), None);
        assert_eq!(parse_token(b"GET /stream/../x HTTP/1.1\r\n\r\n"), None);
    }

    #[tokio::test]
    async fn streams_frames_as_multipart_jpeg() {
        let server = FrameServer::start().await.unwrap();
        let (token, url, tx) = server.register();
        tx.send_replace(Some(Arc::new(vec![0xFF, 0xD8, 1, 2, 0xFF, 0xD9])));
        let port = url.split(':').nth(2).unwrap().split('/').next().unwrap();
        let mut socket = TcpStream::connect(format!("127.0.0.1:{port}"))
            .await
            .unwrap();
        socket
            .write_all(format!("GET /stream/{token} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes())
            .await
            .unwrap();
        let mut received = Vec::new();
        let mut buffer = [0u8; 1024];
        while !String::from_utf8_lossy(&received).contains("Content-Length: 6")
            || !received.ends_with(b"--yzpzframe\r\n")
            || received.len() < 150
        {
            let read = tokio::time::timeout(Duration::from_secs(2), socket.read(&mut buffer))
                .await
                .unwrap()
                .unwrap();
            assert!(read > 0);
            received.extend_from_slice(&buffer[..read]);
        }
        let text = String::from_utf8_lossy(&received);
        assert!(text.starts_with("HTTP/1.1 200 OK"));
        assert!(text.contains("multipart/x-mixed-replace; boundary=yzpzframe"));
        // Ending the stream closes the response.
        drop(tx);
        server.unregister(&token);
        let read = tokio::time::timeout(Duration::from_secs(2), socket.read(&mut buffer))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(read, 0);

        let mut other = TcpStream::connect(format!("127.0.0.1:{port}"))
            .await
            .unwrap();
        other
            .write_all(b"GET /stream/nope HTTP/1.1\r\n\r\n")
            .await
            .unwrap();
        let read = other.read(&mut buffer).await.unwrap();
        assert!(String::from_utf8_lossy(&buffer[..read]).starts_with("HTTP/1.1 404"));
    }
}
