//! Host keys → USB HID keyboard usage codes, which is what idb's HID key
//! events carry (US layout, the Simulator's default hardware keyboard).

pub const LEFT_SHIFT: u64 = 225;

/// A key to press, with Shift held when `shift` is set.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyStroke {
    pub code: u64,
    pub shift: bool,
}

const fn plain(code: u64) -> Option<KeyStroke> {
    Some(KeyStroke { code, shift: false })
}

const fn shifted(code: u64) -> Option<KeyStroke> {
    Some(KeyStroke { code, shift: true })
}

/// The keystroke that types `c`, if the US layout has one.
pub fn char_stroke(c: char) -> Option<KeyStroke> {
    match c {
        'a'..='z' => plain(4 + (c as u64 - 'a' as u64)),
        'A'..='Z' => shifted(4 + (c as u64 - 'A' as u64)),
        '1'..='9' => plain(30 + (c as u64 - '1' as u64)),
        '0' => plain(39),
        '!' => shifted(30),
        '@' => shifted(31),
        '#' => shifted(32),
        '$' => shifted(33),
        '%' => shifted(34),
        '^' => shifted(35),
        '&' => shifted(36),
        '*' => shifted(37),
        '(' => shifted(38),
        ')' => shifted(39),
        '\n' | '\r' => plain(40),
        '\t' => plain(43),
        ' ' => plain(44),
        '-' => plain(45),
        '_' => shifted(45),
        '=' => plain(46),
        '+' => shifted(46),
        '[' => plain(47),
        '{' => shifted(47),
        ']' => plain(48),
        '}' => shifted(48),
        '\\' => plain(49),
        '|' => shifted(49),
        ';' => plain(51),
        ':' => shifted(51),
        '\'' => plain(52),
        '"' => shifted(52),
        '`' => plain(53),
        '~' => shifted(53),
        ',' => plain(54),
        '<' => shifted(54),
        '.' => plain(55),
        '>' => shifted(55),
        '/' => plain(56),
        '?' => shifted(56),
        _ => None,
    }
}

/// The keystroke for a DOM `KeyboardEvent.key` value: a named key, or one
/// printable character.
pub fn key_stroke(key: &str) -> Option<KeyStroke> {
    let named = match key {
        "Enter" => 40,
        "Escape" => 41,
        "Backspace" => 42,
        "Tab" => 43,
        "Insert" => 73,
        "Home" => 74,
        "PageUp" => 75,
        "Delete" => 76,
        "End" => 77,
        "PageDown" => 78,
        "ArrowRight" => 79,
        "ArrowLeft" => 80,
        "ArrowDown" => 81,
        "ArrowUp" => 82,
        _ => {
            let mut chars = key.chars();
            return match (chars.next(), chars.next()) {
                (Some(c), None) => char_stroke(c),
                _ => None,
            };
        }
    };
    plain(named)
}

/// Keystrokes for `text`, or None when a character has no key (emoji,
/// accented letters): such text goes through the pasteboard instead.
pub fn text_strokes(text: &str) -> Option<Vec<KeyStroke>> {
    text.chars()
        .filter(|&c| c != '\r')
        .map(char_stroke)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_letters_digits_and_symbols() {
        assert_eq!(char_stroke('a'), plain(4));
        assert_eq!(char_stroke('Z'), shifted(29));
        assert_eq!(char_stroke('1'), plain(30));
        assert_eq!(char_stroke('0'), plain(39));
        assert_eq!(char_stroke('?'), shifted(56));
        assert_eq!(char_stroke('é'), None);
        assert_eq!(key_stroke("ArrowUp"), plain(82));
        assert_eq!(key_stroke("Backspace"), plain(42));
        assert_eq!(key_stroke("x"), plain(27));
        assert_eq!(key_stroke("F5"), None);
    }

    #[test]
    fn text_needs_every_character_typable() {
        assert_eq!(text_strokes("Hi!\r\n").unwrap().len(), 4);
        assert!(text_strokes("café").is_none());
    }
}
