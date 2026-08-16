use std::{sync::OnceLock, time::Duration};

use regex::Regex;
use serde_json::Value;

const TRANSLATION_ENDPOINT: &str = "https://translate.googleapis.com/translate_a/single";
const MAX_PROMPT_LENGTH: usize = 10_000;
const SUPPORTED_TARGET_LANGUAGES: &[&str] =
    &["ar", "de", "en", "es", "fr", "hi", "ja", "pt", "tr", "ur"];

fn protected_span_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();

    PATTERN.get_or_init(|| {
        Regex::new(
            r#"(?s)```.*?```|`[^`\r\n]+`|https?://[^\s<>()]+|@[A-Za-z0-9_./\\-]+|(?:[A-Za-z]:[\\/]|(?:\.\.?[\\/]))[^\s`\"'<>]+|/(?:[A-Za-z0-9_.@~%+=,;:-]+/)*[A-Za-z0-9_.@~%+=,;:-]+"#,
        )
        .expect("protected prompt span regex must be valid")
    })
}

fn contains_arabic_script(text: &str) -> bool {
    text.chars().any(|character| {
        matches!(
            character as u32,
            0x0600..=0x06FF
                | 0x0750..=0x077F
                | 0x08A0..=0x08FF
                | 0xFB50..=0xFDFF
                | 0xFE70..=0xFEFF
        )
    })
}

fn protect_prompt_spans(text: &str) -> (String, Vec<(String, String)>) {
    let mut protected_spans = Vec::new();
    let prepared = protected_span_pattern().replace_all(text, |captures: &regex::Captures<'_>| {
        let token = format!("__YZPZ_PROTECTED_{}__", protected_spans.len());
        protected_spans.push((token.clone(), captures[0].to_string()));
        token
    });

    (prepared.into_owned(), protected_spans)
}

fn restore_prompt_spans(
    mut translated: String,
    protected_spans: &[(String, String)],
) -> Result<String, String> {
    for (token, original) in protected_spans {
        if !translated.contains(token) {
            return Err(
                "The translation could not safely preserve code, file mentions, URLs, or paths. Your original prompt is unchanged."
                    .to_string(),
            );
        }
        translated = translated.replace(token, original);
    }

    Ok(translated)
}

async fn translate_to_language(text: String, target_language: &str) -> Result<String, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Ok(text);
    }
    if text.chars().count() > MAX_PROMPT_LENGTH {
        return Err(format!(
            "Prompts must be {MAX_PROMPT_LENGTH} characters or fewer to translate."
        ));
    }

    let source_language = if target_language != "ar" && contains_arabic_script(&text) {
        "ar"
    } else {
        "auto"
    };
    let (prepared_text, protected_spans) = protect_prompt_spans(&text);

    let response = reqwest::Client::new()
        .get(TRANSLATION_ENDPOINT)
        .query(&[
            ("client", "gtx"),
            ("sl", source_language),
            ("tl", target_language),
            ("dt", "t"),
            ("q", prepared_text.as_str()),
        ])
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|error| format!("Could not reach the translation service: {error}"))?
        .error_for_status()
        .map_err(|error| format!("The translation service returned an error: {error}"))?;

    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("Could not read the translation response: {error}"))?;

    let translated = payload
        .get(0)
        .and_then(Value::as_array)
        .map(|segments| {
            segments
                .iter()
                .filter_map(|segment| segment.get(0).and_then(Value::as_str))
                .collect::<String>()
        })
        .filter(|translation| !translation.trim().is_empty())
        .ok_or_else(|| "The translation service returned no translated text.".to_string())?;

    restore_prompt_spans(translated, &protected_spans)
}

/// Translates a composer prompt to English while preserving code and workspace references.
#[tauri::command]
pub async fn translate_prompt_to_english(text: String) -> Result<String, String> {
    translate_to_language(text, "en").await
}

/// Translates an agent response to a supported language while preserving code and workspace references.
#[tauri::command]
pub async fn translate_text(text: String, target_language: String) -> Result<String, String> {
    let target_language = target_language.trim().to_ascii_lowercase();
    if !SUPPORTED_TARGET_LANGUAGES.contains(&target_language.as_str()) {
        return Err("That translation language is not available yet.".to_string());
    }

    translate_to_language(text, &target_language).await
}

#[cfg(test)]
mod tests {
    use super::{contains_arabic_script, protect_prompt_spans, restore_prompt_spans};

    #[test]
    fn recognizes_arabic_script_in_a_mixed_prompt() {
        assert!(contains_arabic_script(
            "Update @src/App.tsx واجعل العنوان أزرق"
        ));
        assert!(!contains_arabic_script(
            "Update @src/App.tsx and make the title blue"
        ));
    }

    #[test]
    fn restores_protected_code_and_references() {
        let prompt = "أصلح `const title = 'Hello'` في @src/App.tsx واستخدم https://example.com/docs من C:\\repo\\app";
        let (prepared, protected) = protect_prompt_spans(prompt);

        assert!(!prepared.contains("@src/App.tsx"));
        assert!(!prepared.contains("https://example.com/docs"));
        assert!(!prepared.contains("C:\\repo\\app"));

        let translated = format!(
            "Fix {} in {} and use {} from {}",
            protected[0].0, protected[1].0, protected[2].0, protected[3].0
        );
        assert_eq!(
            restore_prompt_spans(translated, &protected).expect("tokens should restore"),
            "Fix `const title = 'Hello'` in @src/App.tsx and use https://example.com/docs from C:\\repo\\app"
        );
    }
}
