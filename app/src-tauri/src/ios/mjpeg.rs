//! Splits idb's MJPEG video stream (concatenated JPEG images, delivered in
//! arbitrary chunks) back into whole frames, without decoding them.
//!
//! JPEG markers are walked by their lengths; inside entropy-coded data a 0xFF
//! byte is always followed by 0x00 or a restart marker, so the first other
//! marker after the scan header ends that scan. This finds the real end of the
//! image even when an embedded thumbnail carries its own EOI.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JpegFrame {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

#[derive(Default)]
pub struct MjpegSplitter {
    buffer: Vec<u8>,
}

/// Larger than any sane frame; protects against a stream that never ends a frame.
const MAX_BUFFER: usize = 32 * 1024 * 1024;

enum Scan {
    /// A whole image at `start..end`.
    Frame {
        start: usize,
        end: usize,
        width: u32,
        height: u32,
    },
    /// Need more bytes; everything before `keep_from` is garbage.
    Incomplete { keep_from: usize },
}

fn read_u16(data: &[u8], at: usize) -> Option<usize> {
    Some(usize::from(*data.get(at)?) << 8 | usize::from(*data.get(at + 1)?))
}

fn find_soi(data: &[u8], from: usize) -> Option<usize> {
    data.get(from..)?
        .windows(2)
        .position(|w| w == [0xFF, 0xD8])
        .map(|p| p + from)
}

fn scan(data: &[u8]) -> Scan {
    let Some(start) = find_soi(data, 0) else {
        // Keep a trailing 0xFF: it may be the first half of the next SOI.
        let keep_from = if data.last() == Some(&0xFF) {
            data.len() - 1
        } else {
            data.len()
        };
        return Scan::Incomplete { keep_from };
    };
    let incomplete = Scan::Incomplete { keep_from: start };
    let (mut width, mut height) = (0, 0);
    let mut at = start + 2;
    loop {
        // Markers may be preceded by fill bytes (0xFF).
        if data.get(at) != Some(&0xFF) {
            if at >= data.len() {
                return incomplete;
            }
            // Not a marker where one must be: corrupt; resync after this SOI.
            return match find_soi(data, start + 2) {
                Some(next) => Scan::Incomplete { keep_from: next },
                None => Scan::Incomplete {
                    keep_from: data.len(),
                },
            };
        }
        while data.get(at) == Some(&0xFF) {
            at += 1;
        }
        let Some(&marker) = data.get(at) else {
            return incomplete;
        };
        at += 1;
        match marker {
            0xD9 => {
                return Scan::Frame {
                    start,
                    end: at,
                    width,
                    height,
                }
            }
            // A new image before this one ended: drop the broken one.
            0xD8 => return Scan::Incomplete { keep_from: at - 2 },
            0x01 | 0xD0..=0xD7 => continue,
            _ => {}
        }
        let Some(length) = read_u16(data, at) else {
            return incomplete;
        };
        if length < 2 {
            return Scan::Incomplete { keep_from: at };
        }
        if matches!(marker, 0xC0..=0xCF) && !matches!(marker, 0xC4 | 0xC8 | 0xCC) {
            // SOFn: length(2) precision(1) height(2) width(2)
            match (read_u16(data, at + 3), read_u16(data, at + 5)) {
                (Some(h), Some(w)) => {
                    height = h as u32;
                    width = w as u32;
                }
                _ => return incomplete,
            }
        }
        at += length;
        if at > data.len() {
            return incomplete;
        }
        if marker == 0xDA {
            // Entropy-coded data runs until a marker that is not stuffing or
            // a restart.
            loop {
                let Some(offset) = data[at..].iter().position(|&b| b == 0xFF) else {
                    return incomplete;
                };
                at += offset;
                match data.get(at + 1) {
                    None => return incomplete,
                    Some(0x00) | Some(0xD0..=0xD7) | Some(0xFF) => at += 1,
                    Some(_) => break,
                }
            }
        }
    }
}

impl MjpegSplitter {
    /// Adds bytes from the stream and returns the newest complete frame among
    /// them, if any (older complete frames are skipped).
    pub fn push(&mut self, chunk: &[u8]) -> Option<JpegFrame> {
        self.buffer.extend_from_slice(chunk);
        let mut newest = None;
        loop {
            match scan(&self.buffer) {
                Scan::Frame {
                    start,
                    end,
                    width,
                    height,
                } => {
                    newest = Some(JpegFrame {
                        data: self.buffer[start..end].to_vec(),
                        width,
                        height,
                    });
                    self.buffer.drain(..end);
                }
                Scan::Incomplete { keep_from } => {
                    let skipped = keep_from.min(self.buffer.len());
                    self.buffer.drain(..skipped);
                    if self.buffer.len() > MAX_BUFFER {
                        self.buffer.clear();
                    }
                    // A broken frame was dropped; what follows may be whole.
                    if skipped == 0 || self.buffer.is_empty() {
                        return newest;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A minimal well-formed JPEG layout: SOI, APP0, SOF0 (w×h), SOS + data, EOI.
    fn jpeg(width: u16, height: u16, payload: &[u8]) -> Vec<u8> {
        let mut out = vec![0xFF, 0xD8];
        out.extend([0xFF, 0xE0, 0x00, 0x06, b'J', b'F', b'I', b'F']);
        out.extend([0xFF, 0xC0, 0x00, 0x0B, 0x08]);
        out.extend(height.to_be_bytes());
        out.extend(width.to_be_bytes());
        out.extend([0x01, 0x01, 0x11, 0x00]);
        out.extend([0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00]);
        out.extend(payload);
        out.extend([0xFF, 0xD9]);
        out
    }

    #[test]
    fn splits_frames_across_arbitrary_chunks() {
        // Stuffed 0xFF00, a restart marker and a fake EOI inside an APP segment.
        let a = jpeg(390, 844, &[1, 2, 0xFF, 0x00, 3, 0xFF, 0xD3, 4]);
        let b = jpeg(10, 20, &[9, 9]);
        let mut stream = vec![0x00, 0x13];
        stream.extend(&a);
        stream.extend(&b);
        for chunk_size in [1, 3, 7, 64, stream.len()] {
            let mut splitter = MjpegSplitter::default();
            let mut frames = Vec::new();
            for chunk in stream.chunks(chunk_size) {
                if let Some(frame) = splitter.push(chunk) {
                    frames.push(frame);
                }
            }
            let last = frames.last().unwrap();
            assert_eq!((last.width, last.height), (10, 20));
            assert_eq!(last.data, b);
            if chunk_size < 16 {
                assert_eq!(frames.len(), 2);
                assert_eq!(frames[0].data, a);
                assert_eq!((frames[0].width, frames[0].height), (390, 844));
            }
        }
    }

    #[test]
    fn app_segment_with_eoi_bytes_does_not_end_the_frame() {
        let mut image = vec![0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x06, 0xFF, 0xD9, 0xFF, 0xD9];
        image.extend(&jpeg(4, 4, &[5])[2..]);
        let mut splitter = MjpegSplitter::default();
        let frame = splitter.push(&image).unwrap();
        assert_eq!(frame.data, image);
        assert_eq!((frame.width, frame.height), (4, 4));
    }

    #[test]
    fn recovers_from_a_truncated_frame() {
        // A frame cut off before its EOI, then a whole one.
        let good = jpeg(8, 8, &[1]);
        let mut stream = good[..good.len() - 2].to_vec();
        stream.extend(&good);
        let mut splitter = MjpegSplitter::default();
        assert_eq!(splitter.push(&stream).unwrap().data, good);
    }
}
