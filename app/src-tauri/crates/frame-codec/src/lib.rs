//! JPEG encoding for emulator frames.
//!
//! Lives in its own crate because generic encoder code is compiled into the
//! crate that calls it: called from the app, it would inherit the app's
//! unoptimized debug profile and take tens of milliseconds per frame. Here the
//! dev profile override applies, so `tauri dev` streams as smoothly as release.

/// Encodes tightly packed RGB pixels, appending the JPEG to `out`.
pub fn encode_rgb(
    rgb: &[u8],
    width: u16,
    height: u16,
    quality: u8,
    out: &mut Vec<u8>,
) -> Result<(), String> {
    let expected = width as usize * height as usize * 3;
    if rgb.len() < expected {
        return Err(format!(
            "frame has {} bytes, expected {expected}",
            rgb.len()
        ));
    }
    let mut encoder = jpeg_encoder::Encoder::new(out, quality);
    // 4:2:0 chroma: a third smaller and faster than 4:4:4, invisible on UI at this scale.
    encoder.set_sampling_factor(jpeg_encoder::SamplingFactor::F_2_2);
    encoder
        .encode(
            &rgb[..expected],
            width,
            height,
            jpeg_encoder::ColorType::Rgb,
        )
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn encodes_a_jpeg() {
        let mut out = vec![1, 2];
        super::encode_rgb(&[128; 8 * 4 * 3], 8, 4, 80, &mut out).unwrap();
        assert_eq!(&out[..2], &[1, 2]);
        assert_eq!(&out[2..4], &[0xFF, 0xD8]);
        assert!(super::encode_rgb(&[0; 5], 8, 4, 80, &mut Vec::new()).is_err());
    }
}
