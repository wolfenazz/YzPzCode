//! Device frames from the Android SDK's emulator skins.
//!
//! Each AVD names a skin (`skin.path` / `skin.name` in its config.ini). A skin
//! folder holds a `layout` file and images: the phone body (`back.webp`, with a
//! transparent screen area), an optional display mask (`mask.webp`: rounded
//! corners and camera cutout, drawn over the screen) and, in older skins, an
//! `onion` overlay. The layout says where the display sits inside the body.
//! Android Studio draws its device frames from the same files.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Serialize;

use super::avd::{list_avds, parse_ini};
use super::sdk;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSkin {
    pub name: String,
    /// The whole frame, in skin pixels.
    pub frame_width: u32,
    pub frame_height: u32,
    /// Where the display sits inside the frame.
    pub screen_x: u32,
    pub screen_y: u32,
    pub screen_width: u32,
    pub screen_height: u32,
    /// The display's corner radius in display pixels, when the skin says.
    pub corner_radius: Option<u32>,
    /// Data URLs.
    pub background: Option<String>,
    pub mask: Option<String>,
    pub overlay: Option<String>,
}

/// A parsed `layout` file: `key value` pairs and `key { … }` blocks.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Block {
    entries: Vec<(String, Entry)>,
}

#[derive(Debug, Clone, PartialEq)]
enum Entry {
    Value(String),
    Block(Block),
}

impl Block {
    fn block(&self, key: &str) -> Option<&Block> {
        self.entries.iter().find_map(|(k, v)| match v {
            Entry::Block(b) if k == key => Some(b),
            _ => None,
        })
    }

    fn value(&self, key: &str) -> Option<&str> {
        self.entries.iter().find_map(|(k, v)| match v {
            Entry::Value(s) if k == key => Some(s.as_str()),
            _ => None,
        })
    }

    fn number(&self, key: &str) -> Option<u32> {
        self.value(key)?.parse().ok()
    }

    fn path(&self, keys: &[&str]) -> Option<&Block> {
        keys.iter().try_fold(self, |block, key| block.block(key))
    }

    fn blocks(&self) -> impl Iterator<Item = &Block> {
        self.entries.iter().filter_map(|(_, v)| match v {
            Entry::Block(b) => Some(b),
            _ => None,
        })
    }
}

pub fn parse_layout(text: &str) -> Block {
    let tokens: Vec<&str> = text
        .lines()
        .map(|line| line.split('#').next().unwrap_or(""))
        .flat_map(|line| {
            line.split_whitespace().flat_map(|word| {
                // Split "name{" / "}" glued to words.
                let mut parts = Vec::new();
                let mut rest = word;
                while let Some(index) = rest.find(['{', '}']) {
                    if index > 0 {
                        parts.push(&rest[..index]);
                    }
                    parts.push(&rest[index..index + 1]);
                    rest = &rest[index + 1..];
                }
                if !rest.is_empty() {
                    parts.push(rest);
                }
                parts
            })
        })
        .collect();
    let mut index = 0;
    parse_block(&tokens, &mut index)
}

fn parse_block(tokens: &[&str], index: &mut usize) -> Block {
    let mut block = Block::default();
    while *index < tokens.len() {
        let token = tokens[*index];
        *index += 1;
        if token == "}" {
            break;
        }
        if token == "{" {
            continue;
        }
        match tokens.get(*index) {
            Some(&"{") => {
                *index += 1;
                block
                    .entries
                    .push((token.to_string(), Entry::Block(parse_block(tokens, index))));
            }
            Some(value) if *value != "}" => {
                *index += 1;
                block
                    .entries
                    .push((token.to_string(), Entry::Value(value.to_string())));
            }
            _ => {}
        }
    }
    block
}

fn data_url(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let mime = match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "webp" => "image/webp",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => return None,
    };
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

/// The skin folder an AVD uses, if it has a real (image) skin.
pub fn skin_dir_for_avd(avd_name: &str) -> Option<PathBuf> {
    let avd = list_avds().into_iter().find(|avd| avd.name == avd_name)?;
    let config = std::fs::read_to_string(Path::new(&avd.path).join("config.ini")).ok()?;
    let config = parse_ini(&config);
    let sdk_dir = sdk::android_sdk_dir_or_default();
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(path) = config
        .get("skin.path")
        .filter(|p| !p.is_empty() && *p != "_no_skin")
    {
        let path = PathBuf::from(path);
        candidates.push(if path.is_absolute() {
            path.clone()
        } else {
            sdk_dir.join("skins").join(&path)
        });
        if !path.is_absolute() {
            candidates.push(sdk_dir.join(&path));
        }
    }
    if let Some(name) = config.get("skin.name").filter(|n| !n.is_empty()) {
        candidates.push(sdk_dir.join("skins").join(name));
    }
    candidates.into_iter().find_map(|dir| {
        if dir.join("layout").is_file() {
            Some(dir)
        } else if dir.join("default").join("layout").is_file() {
            // Foldables keep one skin per posture.
            Some(dir.join("default"))
        } else {
            None
        }
    })
}

pub fn load_skin(dir: &Path) -> Option<DeviceSkin> {
    let layout = parse_layout(&std::fs::read_to_string(dir.join("layout")).ok()?);
    let display = layout.path(&["parts", "device", "display"])?;
    // Phones define a portrait layout; car and some tablet skins only a
    // landscape one, which is then their natural orientation.
    let layouts = layout.block("layouts")?;
    let portrait = layouts
        .block("portrait")
        .or_else(|| layouts.blocks().next())?;
    // The portrait layout places parts by name; the frame part is whichever
    // one is not the device display.
    let mut screen = (0u32, 0u32);
    let mut frame_part: Option<(String, u32, u32)> = None;
    for part in portrait.blocks() {
        let Some(name) = part.value("name") else {
            continue;
        };
        let at = (part.number("x").unwrap_or(0), part.number("y").unwrap_or(0));
        if name == "device" {
            screen = at;
        } else {
            frame_part = Some((name.to_string(), at.0, at.1));
        }
    }
    let screen_width = display.number("width")?;
    let screen_height = display.number("height")?;
    let frame = frame_part
        .as_ref()
        .and_then(|(name, _, _)| layout.path(&["parts", name]));
    let image = |keys: &[&str], key: &str| {
        frame
            .and_then(|f| f.path(keys))
            .and_then(|b| b.value(key))
            .and_then(|file| data_url(&dir.join(file)))
    };
    Some(DeviceSkin {
        name: dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        frame_width: portrait.number("width").unwrap_or(screen_width),
        frame_height: portrait.number("height").unwrap_or(screen_height),
        screen_x: screen.0,
        screen_y: screen.1,
        screen_width,
        screen_height,
        corner_radius: display.number("corner_radius"),
        background: image(&["background"], "image"),
        mask: image(&["foreground"], "mask"),
        overlay: image(&["onion"], "image"),
    })
}

/// Cached per AVD; skins never change while the app runs.
pub fn skin_for_avd(avd_name: &str) -> Option<DeviceSkin> {
    static CACHE: std::sync::LazyLock<std::sync::Mutex<HashMap<String, Option<DeviceSkin>>>> =
        std::sync::LazyLock::new(Default::default);
    if let Some(cached) = CACHE.lock().unwrap().get(avd_name) {
        return cached.clone();
    }
    let skin = skin_dir_for_avd(avd_name).and_then(|dir| load_skin(&dir));
    CACHE
        .lock()
        .unwrap()
        .insert(avd_name.to_string(), skin.clone());
    skin
}

#[cfg(test)]
mod tests {
    use super::*;

    const MODERN: &str = "parts {\n  device {\n    display {\n      width 1280\n      height 2856\n      x 0\n      y 0\n      corner_radius 109\n    }\n  }\n  portrait {\n    background {\n      image back.webp\n    }\n    foreground {\n      mask mask.webp\n      cutout hole\n    }\n  }\n}\nlayouts {\n  portrait {\n    width 1408\n    height 2974\n    event EV_SW:0:1\n    part1 {\n      name portrait\n      x 0\n      y 0\n    }\n    part2 {\n      name device\n      x 60\n      y 61\n    }\n  }\n}\n";

    #[test]
    fn parses_nested_layout_blocks() {
        let layout = parse_layout(MODERN);
        let display = layout.path(&["parts", "device", "display"]).unwrap();
        assert_eq!(display.number("corner_radius"), Some(109));
        assert_eq!(
            layout
                .path(&["parts", "portrait", "foreground"])
                .unwrap()
                .value("mask"),
            Some("mask.webp")
        );
        assert_eq!(
            layout
                .path(&["layouts", "portrait"])
                .unwrap()
                .blocks()
                .count(),
            2
        );
        // Braces glued to words and comments are tolerated.
        let glued = parse_layout("parts{ device{ display{ width 10 # c\n height 20 } } }");
        assert_eq!(
            glued
                .path(&["parts", "device", "display"])
                .unwrap()
                .number("height"),
            Some(20)
        );
    }

    #[test]
    fn loads_frame_geometry_and_images() {
        let dir = std::env::temp_dir().join(format!("yzpz-skin-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("layout"), MODERN).unwrap();
        std::fs::write(dir.join("back.webp"), b"RIFF").unwrap();
        let skin = load_skin(&dir).unwrap();
        assert_eq!((skin.frame_width, skin.frame_height), (1408, 2974));
        assert_eq!(
            (
                skin.screen_x,
                skin.screen_y,
                skin.screen_width,
                skin.screen_height
            ),
            (60, 61, 1280, 2856)
        );
        assert_eq!(skin.corner_radius, Some(109));
        assert!(skin
            .background
            .unwrap()
            .starts_with("data:image/webp;base64,"));
        assert!(skin.mask.is_none(), "missing files are skipped");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reads_onion_overlays_from_older_skins() {
        let dir = std::env::temp_dir().join(format!("yzpz-skin-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("layout"),
            "parts { device { display { width 1080 height 1920 x 0 y 0 } } portrait { background { image port_back.png } onion { image port_fore.png } } }\nlayouts { portrait { width 1370 height 2405 part1 { name portrait x 0 y 0 } part2 { name device x 144 y 195 } } }",
        )
        .unwrap();
        std::fs::write(dir.join("port_back.png"), b"x").unwrap();
        std::fs::write(dir.join("port_fore.png"), b"x").unwrap();
        let skin = load_skin(&dir).unwrap();
        assert_eq!((skin.screen_x, skin.screen_y), (144, 195));
        assert!(skin.overlay.unwrap().starts_with("data:image/png"));
        assert_eq!(skin.corner_radius, None);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    #[ignore]
    fn every_sdk_skin_loads() {
        let skins = sdk::android_sdk_dir_or_default().join("skins");
        for entry in std::fs::read_dir(skins).unwrap().flatten() {
            let mut dir = entry.path();
            if dir.join("default").is_dir() {
                dir = dir.join("default");
            }
            if !dir.join("layout").is_file() {
                continue;
            }
            let skin = load_skin(&dir).unwrap_or_else(|| panic!("{} failed", dir.display()));
            assert!(
                skin.background.is_some(),
                "{} has no body image",
                dir.display()
            );
            assert!(
                skin.screen_x + skin.screen_width <= skin.frame_width,
                "{} display overflows",
                dir.display()
            );
            println!(
                "{:<28} frame {}x{} screen {}x{}@{},{} r={:?} mask={} onion={}",
                skin.name,
                skin.frame_width,
                skin.frame_height,
                skin.screen_width,
                skin.screen_height,
                skin.screen_x,
                skin.screen_y,
                skin.corner_radius,
                skin.mask.is_some(),
                skin.overlay.is_some()
            );
        }
    }
}
