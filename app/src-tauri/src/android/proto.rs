//! The subset of the Android emulator's gRPC API (`emulator_controller.proto`,
//! shipped in `<sdk>/emulator/lib`) the embedded device view uses.
//!
//! The messages are written by hand with `prost` derives so the build needs no
//! `protoc`. Field numbers match the proto file; proto3 decoding ignores the
//! fields left out here.

use prost::Message;

pub const SERVICE: &str = "/android.emulation.control.EmulatorController";

#[derive(Clone, PartialEq, Message)]
pub struct Empty {}

#[derive(Clone, Copy, Debug, PartialEq, Eq, prost::Enumeration)]
#[repr(i32)]
pub enum ImgFormat {
    Png = 0,
    Rgba8888 = 1,
    Rgb888 = 2,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, prost::Enumeration)]
#[repr(i32)]
pub enum SkinRotation {
    Portrait = 0,
    Landscape = 1,
    ReversePortrait = 2,
    ReverseLandscape = 3,
}

#[derive(Clone, PartialEq, Message)]
pub struct Rotation {
    #[prost(enumeration = "SkinRotation", tag = "1")]
    pub rotation: i32,
    #[prost(double, tag = "2")]
    pub x_axis: f64,
    #[prost(double, tag = "3")]
    pub y_axis: f64,
    #[prost(double, tag = "4")]
    pub z_axis: f64,
}

#[derive(Clone, PartialEq, Message)]
pub struct ImageFormat {
    #[prost(enumeration = "ImgFormat", tag = "1")]
    pub format: i32,
    #[prost(message, optional, tag = "2")]
    pub rotation: Option<Rotation>,
    #[prost(uint32, tag = "3")]
    pub width: u32,
    #[prost(uint32, tag = "4")]
    pub height: u32,
    #[prost(uint32, tag = "5")]
    pub display: u32,
}

#[derive(Clone, PartialEq, Message)]
pub struct Image {
    #[prost(message, optional, tag = "1")]
    pub format: Option<ImageFormat>,
    #[prost(bytes = "vec", tag = "4")]
    pub image: Vec<u8>,
    #[prost(uint32, tag = "5")]
    pub seq: u32,
    #[prost(uint64, tag = "6")]
    pub timestamp_us: u64,
}

#[derive(Clone, PartialEq, Message)]
pub struct Touch {
    #[prost(int32, tag = "1")]
    pub x: i32,
    #[prost(int32, tag = "2")]
    pub y: i32,
    #[prost(int32, tag = "3")]
    pub identifier: i32,
    #[prost(int32, tag = "4")]
    pub pressure: i32,
    #[prost(int32, tag = "5")]
    pub touch_major: i32,
    #[prost(int32, tag = "6")]
    pub touch_minor: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct TouchEvent {
    #[prost(message, repeated, tag = "1")]
    pub touches: Vec<Touch>,
    #[prost(int32, tag = "2")]
    pub display: i32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, prost::Enumeration)]
#[repr(i32)]
pub enum KeyEventType {
    Keydown = 0,
    Keyup = 1,
    Keypress = 2,
}

#[derive(Clone, PartialEq, Message)]
pub struct KeyboardEvent {
    #[prost(int32, tag = "1")]
    pub code_type: i32,
    #[prost(enumeration = "KeyEventType", tag = "2")]
    pub event_type: i32,
    #[prost(int32, tag = "3")]
    pub key_code: i32,
    #[prost(string, tag = "4")]
    pub key: String,
    #[prost(string, tag = "5")]
    pub text: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct ParameterValue {
    #[prost(float, repeated, tag = "1")]
    pub data: Vec<f32>,
}

/// `PhysicalModelValue.PhysicalType.ROTATION`.
pub const PHYSICAL_ROTATION: i32 = 1;

#[derive(Clone, PartialEq, Message)]
pub struct PhysicalModelValue {
    #[prost(int32, tag = "1")]
    pub target: i32,
    #[prost(int32, tag = "2")]
    pub status: i32,
    #[prost(message, optional, tag = "3")]
    pub value: Option<ParameterValue>,
}

#[derive(Clone, PartialEq, Message)]
pub struct Entry {
    #[prost(string, tag = "1")]
    pub key: String,
    #[prost(string, tag = "2")]
    pub value: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct EntryList {
    #[prost(message, repeated, tag = "1")]
    pub entry: Vec<Entry>,
}

#[derive(Clone, PartialEq, Message)]
pub struct EmulatorStatus {
    #[prost(string, tag = "1")]
    pub version: String,
    #[prost(uint64, tag = "2")]
    pub uptime: u64,
    #[prost(bool, tag = "3")]
    pub booted: bool,
    #[prost(message, optional, tag = "5")]
    pub hardware_config: Option<EntryList>,
}

/// `VmRunState.RunState`.
pub const VM_SHUTDOWN: i32 = 5;

#[derive(Clone, PartialEq, Message)]
pub struct VmRunState {
    #[prost(int32, tag = "1")]
    pub state: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct ClipData {
    #[prost(string, tag = "1")]
    pub text: String,
}
