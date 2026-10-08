//! The subset of idb's companion gRPC API (`idb.proto`, facebook/idb) the
//! embedded iOS Simulator view uses.
//!
//! Hand-written `prost` messages, like the Android emulator's, so the build
//! needs no `protoc`. Field numbers match `idb.proto`; proto3 decoding ignores
//! the fields left out here.

use prost::Message;

pub const SERVICE: &str = "/idb.CompanionService";

#[derive(Clone, Copy, PartialEq, Message)]
pub struct Point {
    #[prost(double, tag = "1")]
    pub x: f64,
    #[prost(double, tag = "2")]
    pub y: f64,
}

// ── describe ────────────────────────────────────────────────────────────

#[derive(Clone, PartialEq, Message)]
pub struct TargetDescriptionRequest {
    #[prost(bool, tag = "1")]
    pub fetch_diagnostics: bool,
}

#[derive(Clone, PartialEq, Message)]
pub struct TargetDescriptionResponse {
    #[prost(message, optional, tag = "1")]
    pub target_description: Option<TargetDescription>,
}

#[derive(Clone, PartialEq, Message)]
pub struct TargetDescription {
    #[prost(string, tag = "1")]
    pub udid: String,
    #[prost(string, tag = "2")]
    pub name: String,
    #[prost(message, optional, tag = "3")]
    pub screen_dimensions: Option<ScreenDimensions>,
    #[prost(string, tag = "4")]
    pub state: String,
    #[prost(string, tag = "6")]
    pub os_version: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct ScreenDimensions {
    #[prost(uint64, tag = "1")]
    pub width: u64,
    #[prost(uint64, tag = "2")]
    pub height: u64,
    #[prost(double, tag = "3")]
    pub density: f64,
    #[prost(uint64, tag = "4")]
    pub width_points: u64,
    #[prost(uint64, tag = "5")]
    pub height_points: u64,
}

// ── hid ─────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq, prost::Enumeration)]
#[repr(i32)]
pub enum HidDirection {
    Down = 0,
    Up = 1,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, prost::Enumeration)]
#[repr(i32)]
pub enum HidButtonType {
    ApplePay = 0,
    Home = 1,
    Lock = 2,
    SideButton = 3,
    Siri = 4,
    PlayPause = 5,
    VolumeUp = 6,
    VolumeDown = 7,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, prost::Enumeration)]
#[repr(i32)]
pub enum HidOrientationType {
    Portrait = 0,
    PortraitUpsideDown = 1,
    LandscapeLeft = 2,
    LandscapeRight = 3,
}

#[derive(Clone, PartialEq, Message)]
pub struct HidTouch {
    #[prost(message, optional, tag = "1")]
    pub point: Option<Point>,
}

#[derive(Clone, PartialEq, Message)]
pub struct HidButton {
    #[prost(enumeration = "HidButtonType", tag = "1")]
    pub button: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct HidKey {
    #[prost(uint64, tag = "1")]
    pub keycode: u64,
}

#[derive(Clone, PartialEq, prost::Oneof)]
pub enum PressAction {
    #[prost(message, tag = "1")]
    Touch(HidTouch),
    #[prost(message, tag = "2")]
    Button(HidButton),
    #[prost(message, tag = "3")]
    Key(HidKey),
}

#[derive(Clone, PartialEq, Message)]
pub struct HidPressAction {
    #[prost(oneof = "PressAction", tags = "1, 2, 3")]
    pub action: Option<PressAction>,
}

#[derive(Clone, PartialEq, Message)]
pub struct HidPress {
    #[prost(message, optional, tag = "1")]
    pub action: Option<HidPressAction>,
    #[prost(enumeration = "HidDirection", tag = "2")]
    pub direction: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct HidDelay {
    #[prost(double, tag = "1")]
    pub duration: f64,
}

#[derive(Clone, PartialEq, Message)]
pub struct HidOrientation {
    #[prost(enumeration = "HidOrientationType", tag = "1")]
    pub orientation: i32,
}

#[derive(Clone, PartialEq, prost::Oneof)]
pub enum Event {
    #[prost(message, tag = "1")]
    Press(HidPress),
    #[prost(message, tag = "3")]
    Delay(HidDelay),
    #[prost(message, tag = "5")]
    Orientation(HidOrientation),
}

#[derive(Clone, PartialEq, Message)]
pub struct HidEvent {
    #[prost(oneof = "Event", tags = "1, 3, 5")]
    pub event: Option<Event>,
}

#[derive(Clone, PartialEq, Message)]
pub struct HidResponse {}

impl HidEvent {
    fn press(action: PressAction, direction: HidDirection) -> Self {
        Self {
            event: Some(Event::Press(HidPress {
                action: Some(HidPressAction {
                    action: Some(action),
                }),
                direction: direction as i32,
            })),
        }
    }

    /// A finger at `point` (in points). Repeated downs move the finger.
    pub fn touch(x: f64, y: f64, direction: HidDirection) -> Self {
        Self::press(
            PressAction::Touch(HidTouch {
                point: Some(Point { x, y }),
            }),
            direction,
        )
    }

    pub fn button(button: HidButtonType, direction: HidDirection) -> Self {
        Self::press(
            PressAction::Button(HidButton {
                button: button as i32,
            }),
            direction,
        )
    }

    /// A USB HID keyboard usage code.
    pub fn key(keycode: u64, direction: HidDirection) -> Self {
        Self::press(PressAction::Key(HidKey { keycode }), direction)
    }

    pub fn delay(seconds: f64) -> Self {
        Self {
            event: Some(Event::Delay(HidDelay { duration: seconds })),
        }
    }
}

// ── set_orientation ─────────────────────────────────────────────────────

#[derive(Clone, PartialEq, Message)]
pub struct SetOrientationRequest {
    #[prost(enumeration = "HidOrientationType", tag = "1")]
    pub orientation: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct SetOrientationResponse {}

// ── video_stream ────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq, prost::Enumeration)]
#[repr(i32)]
pub enum VideoFormat {
    H264 = 0,
    Rbga = 1,
    Mjpeg = 2,
    Minicap = 3,
    I420 = 4,
}

#[derive(Clone, PartialEq, Message)]
pub struct VideoStreamStart {
    #[prost(string, tag = "1")]
    pub file_path: String,
    #[prost(uint64, tag = "2")]
    pub fps: u64,
    #[prost(enumeration = "VideoFormat", tag = "3")]
    pub format: i32,
    #[prost(double, tag = "4")]
    pub compression_quality: f64,
    #[prost(double, tag = "5")]
    pub scale_factor: f64,
}

#[derive(Clone, PartialEq, Message)]
pub struct VideoStreamStop {}

#[derive(Clone, PartialEq, prost::Oneof)]
pub enum VideoControl {
    #[prost(message, tag = "1")]
    Start(VideoStreamStart),
    #[prost(message, tag = "2")]
    Stop(VideoStreamStop),
}

#[derive(Clone, PartialEq, Message)]
pub struct VideoStreamRequest {
    #[prost(oneof = "VideoControl", tags = "1, 2")]
    pub control: Option<VideoControl>,
}

#[derive(Clone, PartialEq, prost::Oneof)]
pub enum PayloadSource {
    #[prost(string, tag = "1")]
    FilePath(String),
    #[prost(bytes = "vec", tag = "2")]
    Data(Vec<u8>),
    #[prost(string, tag = "3")]
    Url(String),
}

#[derive(Clone, PartialEq, Message)]
pub struct Payload {
    #[prost(oneof = "PayloadSource", tags = "1, 2, 3")]
    pub source: Option<PayloadSource>,
}

#[derive(Clone, PartialEq, prost::Oneof)]
pub enum VideoOutput {
    #[prost(bytes = "vec", tag = "1")]
    LogOutput(Vec<u8>),
    #[prost(message, tag = "2")]
    Payload(Payload),
}

#[derive(Clone, PartialEq, Message)]
pub struct VideoStreamResponse {
    #[prost(oneof = "VideoOutput", tags = "1, 2")]
    pub output: Option<VideoOutput>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_a_touch_like_idb_proto() {
        // HIDEvent{press{action{touch{point{x:10,y:20}}}, direction: UP}}
        let bytes = HidEvent::touch(10.0, 20.0, HidDirection::Up).encode_to_vec();
        let decoded = HidEvent::decode(bytes.as_slice()).unwrap();
        let Some(Event::Press(press)) = decoded.event else {
            panic!("not a press")
        };
        assert_eq!(press.direction, 1);
        assert!(matches!(
            press.action.and_then(|a| a.action),
            Some(PressAction::Touch(HidTouch { point: Some(Point { x, y }) })) if x == 10.0 && y == 20.0
        ));
        // Field 1 (press, length-delimited) leads the encoding.
        assert_eq!(bytes[0], 0x0A);
    }

    #[test]
    fn video_payload_data_decodes() {
        let response = VideoStreamResponse {
            output: Some(VideoOutput::Payload(Payload {
                source: Some(PayloadSource::Data(vec![0xFF, 0xD8])),
            })),
        };
        let bytes = response.encode_to_vec();
        // output.payload = field 2; payload.data = field 2.
        assert_eq!(&bytes[..4], &[0x12, 0x04, 0x12, 0x02]);
        assert_eq!(
            VideoStreamResponse::decode(bytes.as_slice()).unwrap(),
            response
        );
    }
}
