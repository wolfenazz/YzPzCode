use anyhow::Context;

use super::github;
use super::types::{SkillAuditResponse, SkillDetail, SkillListResponse, SkillSearchResponse, SkillSummary};

pub const SKILLS_BASE_URL: &str = "https://skills.sh";
/// Prefix for errors that mean "this needs a skills.sh API key". The frontend
/// checks this prefix to render the key-gate panel instead of a raw error.
pub const NEEDS_KEY_PREFIX: &str = "SKILLS_API_KEY_REQUIRED:";

/// Catalog base URL, overridable exactly like the `skills` CLI does with
/// `SKILLS_API_URL` (used by its `find` command).
pub fn api_base() -> String {
    std::env::var("SKILLS_API_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| SKILLS_BASE_URL.to_string())
}

/// Pure precedence helper (kept separate so unit tests don't touch the
/// process environment): explicit parameter wins, then `SKILLS_API_KEY`.
fn pick_key(explicit: Option<&str>, env_val: Option<&str>) -> Option<String> {
    let clean = |value: &str| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    };
    explicit
        .and_then(clean)
        .or_else(|| env_val.and_then(clean))
}

/// API key for the authenticated `/api/v1/*` endpoints: explicit Settings
/// value first, `SKILLS_API_KEY` environment variable as fallback.
pub fn resolve_api_key(explicit: Option<&str>) -> Option<String> {
    pick_key(explicit, std::env::var("SKILLS_API_KEY").ok().as_deref())
}

fn needs_key_error(what: &str) -> anyhow::Error {
    anyhow::anyhow!(
        "{NEEDS_KEY_PREFIX} {what} needs a skills.sh API key: skills.sh removed anonymous catalog access after scraper abuse. Request a key at https://skills.sh/contact, then paste it in Settings → Agents → Skills Market (or set the SKILLS_API_KEY environment variable). Search still works without a key."
    )
}

fn key_rejected_error() -> anyhow::Error {
    anyhow::anyhow!(
        "The skills.sh API key was rejected (401). Check the key in Settings → Agents → Skills Market."
    )
}

fn rate_limit_error(response: &reqwest::Response) -> anyhow::Error {
    let retry = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .map(|value| format!(" Retry after {value}s."))
        .unwrap_or_default();
    anyhow::anyhow!("skills.sh rate limit reached (429).{retry}")
}

pub fn client() -> anyhow::Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("YzPzCode")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .context("failed to build skills HTTP client")
}

fn error_snippet(status: reqwest::StatusCode, body: &str, what: &str) -> anyhow::Error {
    let snippet: String = body.chars().take(300).collect();
    anyhow::anyhow!("{what} failed ({status}): {snippet}")
}

pub async fn fetch_trending(
    view: &str,
    page: u32,
    per_page: u32,
    api_key: Option<&str>,
) -> anyhow::Result<SkillListResponse> {
    // The leaderboard is key-gated: /api/v1/* returns 401 without a key.
    let Some(key) = resolve_api_key(api_key) else {
        return Err(needs_key_error("The skills leaderboard"));
    };
    let http = client()?;
    // Our pages are 1-indexed; the API's `page` parameter is 0-indexed.
    let api_page = page.saturating_sub(1);
    let url = format!("{}/api/v1/skills", api_base());
    let response = http
        .get(&url)
        .query(&[
            ("view", view),
            ("page", &api_page.to_string()),
            ("per_page", &per_page.to_string()),
        ])
        .bearer_auth(&key)
        .send()
        .await
        .context("failed to request trending skills")?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(key_rejected_error());
    }
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(rate_limit_error(&response));
    }

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(error_snippet(status, &body, "Skills leaderboard request"));
    }

    let mut parsed = response
        .json::<SkillListResponse>()
        .await
        .context("failed to decode trending skills response")?;
    // Restore our 1-indexed paging so "load more" advances correctly.
    parsed.pagination.page = page;
    parsed.pagination.per_page = per_page;
    // The v1 payload may omit stars; fill from GitHub best-effort.
    enrich_with_stars(&mut parsed.data).await;
    Ok(parsed)
}

#[derive(Debug, serde::Deserialize)]
pub(crate) struct PublicSearchSkill {
    #[serde(default)]
    id: String,
    #[serde(default)]
    source: String,
    #[serde(default, alias = "skillId")]
    skill_id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    installs: i64,
}

#[derive(Debug, serde::Deserialize)]
struct PublicSearchResponse {
    #[serde(default)]
    skills: Vec<PublicSearchSkill>,
    #[serde(default)]
    query: String,
    #[serde(default, alias = "searchType")]
    search_type: String,
    #[serde(default)]
    count: usize,
}

/// Map one entry of the public `/api/search` response to our catalog shape.
/// Fields the public endpoint omits (`sourceType`, `installUrl`, `url`) are
/// derived deterministically from `source` and `id`.
pub(crate) fn public_skill_to_summary(skill: &PublicSearchSkill) -> SkillSummary {
    let slug = if skill.skill_id.trim().is_empty() {
        skill.id.rsplit('/').next().unwrap_or("").trim()
    } else {
        skill.skill_id.trim()
    }
    .to_string();
    let source = skill.source.trim().to_string();
    let is_github = source.contains('/');
    let (source_type, install_url) = if is_github {
        (
            "github".to_string(),
            Some(format!("https://github.com/{source}")),
        )
    } else if source.contains('.') {
        (
            "well-known".to_string(),
            Some(format!("https://{source}")),
        )
    } else {
        ("github".to_string(), None)
    };
    SkillSummary {
        id: skill.id.trim().to_string(),
        slug,
        name: if skill.name.trim().is_empty() {
            skill.id.trim().to_string()
        } else {
            skill.name.trim().to_string()
        },
        source,
        installs: skill.installs.max(0),
        stars: None,
        source_type,
        install_url,
        url: format!("https://skills.sh/{}", skill.id.trim()),
        is_duplicate: None,
    }
}

/// Split a `owner/repo` catalog source into its parts. Returns `None` for
/// well-known (`example.com`) and other non-GitHub sources.
fn split_repo_source(source: &str) -> Option<(&str, &str)> {
    let mut parts = source.split('/');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(owner), Some(repo), None)
            if !owner.trim().is_empty() && !repo.trim().is_empty() =>
        {
            Some((owner.trim(), repo.trim()))
        }
        _ => None,
    }
}

/// Fill in GitHub stars for summaries that don't already have them. Best
/// effort: unique repos are fetched concurrently and failures leave
/// `stars` as `None` so the catalog call itself never fails over stars.
async fn enrich_with_stars(summaries: &mut [SkillSummary]) {
    use std::collections::{HashMap, HashSet};

    let pending: HashSet<String> = summaries
        .iter()
        .filter(|summary| summary.stars.is_none())
        .filter_map(|summary| {
            let (owner, repo) = split_repo_source(summary.source.trim())?;
            Some(format!("{owner}/{repo}"))
        })
        .collect();
    if pending.is_empty() {
        return;
    }

    let handles: Vec<_> = pending
        .into_iter()
        .map(|full| {
            tokio::spawn(async move {
                let (owner, repo) = full
                    .split_once('/')
                    .unwrap_or((full.as_str(), ""));
                let stars = github::fetch_repo_stars(owner, repo).await;
                (full, stars)
            })
        })
        .collect();

    let mut stars_by_repo: HashMap<String, i64> = HashMap::new();
    for handle in handles {
        if let Ok((full, Some(stars))) = handle.await {
            stars_by_repo.insert(full, stars);
        }
    }
    if stars_by_repo.is_empty() {
        return;
    }

    for summary in summaries.iter_mut() {
        if summary.stars.is_some() {
            continue;
        }
        let key = summary.source.trim().to_string();
        if let Some(stars) = stars_by_repo.get(&key) {
            summary.stars = Some(*stars);
        }
    }
}

/// Search via the same public endpoint the `skills` CLI itself uses
/// (`GET /api/search`), which needs no API key. An attached key is still sent
/// when present so tightening on skills.sh's side keeps working.
pub async fn fetch_search(
    query: &str,
    limit: u8,
    owner: Option<&str>,
    api_key: Option<&str>,
) -> anyhow::Result<SkillSearchResponse> {
    let http = client()?;
    let url = format!("{}/api/search", api_base());
    let mut request = http
        .get(&url)
        .query(&[("q", query), ("limit", &limit.to_string())]);
    if let Some(owner) = owner {
        if !owner.trim().is_empty() {
            request = request.query(&[("owner", owner)]);
        }
    }
    if let Some(key) = resolve_api_key(api_key) {
        request = request.bearer_auth(key);
    }

    let response = request
        .send()
        .await
        .context("failed to request skill search")?;

    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(rate_limit_error(&response));
    }
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(error_snippet(status, &body, "Skill search request"));
    }

    let parsed = response
        .json::<PublicSearchResponse>()
        .await
        .context("failed to decode skill search response")?;
    let mut data = parsed
        .skills
        .iter()
        .map(public_skill_to_summary)
        .collect::<Vec<_>>();
    // Public search carries installs but no stars; fill stars from GitHub
    // (same repo every skill in a source shares the count).
    enrich_with_stars(&mut data).await;
    let count = if parsed.count == 0 { data.len() } else { parsed.count };
    Ok(SkillSearchResponse {
        data,
        query: if parsed.query.is_empty() {
            query.to_string()
        } else {
            parsed.query
        },
        search_type: if parsed.search_type.is_empty() {
            "keyword".to_string()
        } else {
            parsed.search_type
        },
        count,
    })
}

/// Split a detail id of the form `owner/repo/slug` (GitHub sources only).
fn split_github_id(skill_id: &str) -> Option<(String, String, String)> {
    let parts: Vec<&str> = skill_id.split('/').collect();
    if parts.len() == 3 && parts.iter().all(|part| !part.trim().is_empty()) {
        Some((
            parts[0].trim().to_string(),
            parts[1].trim().to_string(),
            parts[2].trim().to_string(),
        ))
    } else {
        None
    }
}

pub async fn fetch_detail(skill_id: &str, api_key: Option<&str>) -> anyhow::Result<SkillDetail> {
    if let Some(key) = resolve_api_key(api_key) {
        let http = client()?;
        let url = format!("{}/api/v1/skills/{skill_id}", api_base());
        let response = http
            .get(&url)
            .bearer_auth(key)
            .send()
            .await
            .context("failed to request skill detail")?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(key_rejected_error());
        }
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            anyhow::bail!("Skill not found: {skill_id}");
        }
        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(rate_limit_error(&response));
        }
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(error_snippet(status, &body, "Skill detail request"));
        }
        return response
            .json::<SkillDetail>()
            .await
            .context("failed to decode skill detail response");
    }

    // Key-free fallback: pull SKILL.md straight from the public GitHub repo.
    let Some((owner, repo, slug)) = split_github_id(skill_id) else {
        return Err(needs_key_error("Skill file previews"));
    };
    let files = github::fetch_skill_preview(&owner, &repo, &slug).await?;
    let stars = github::fetch_repo_stars(&owner, &repo).await;
    Ok(SkillDetail {
        id: skill_id.to_string(),
        source: format!("{owner}/{repo}"),
        slug,
        installs: 0,
        stars,
        hash: None,
        files: Some(files),
    })
}

pub async fn fetch_audit(skill_id: &str, api_key: Option<&str>) -> anyhow::Result<SkillAuditResponse> {
    // Audits are computed server-side; only the key-gated endpoint has them.
    let Some(key) = resolve_api_key(api_key) else {
        return Err(needs_key_error("Security audits"));
    };
    let http = client()?;
    let url = format!("{}/api/v1/skills/audit/{skill_id}", api_base());
    let response = http
        .get(&url)
        .bearer_auth(key)
        .send()
        .await
        .context("failed to request skill audit")?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        anyhow::bail!("No audits yet for this skill");
    }
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(key_rejected_error());
    }
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(rate_limit_error(&response));
    }
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(error_snippet(status, &body, "Skill audit request"));
    }

    response
        .json::<SkillAuditResponse>()
        .await
        .context("failed to decode skill audit response")
}

#[cfg(test)]
mod tests {
    use super::{pick_key, public_skill_to_summary, split_github_id, split_repo_source, PublicSearchSkill, NEEDS_KEY_PREFIX};

    fn sample_skill() -> PublicSearchSkill {
        serde_json::from_str(
            r#"{"id":"vercel-labs/agent-skills/vercel-react-best-practices","source":"vercel-labs/agent-skills","skillId":"vercel-react-best-practices","name":"vercel-react-best-practices","installs":799510}"#,
        )
        .expect("sample parses")
    }

    #[test]
    fn maps_public_search_entry_to_summary() {
        let summary = public_skill_to_summary(&sample_skill());
        assert_eq!(summary.id, "vercel-labs/agent-skills/vercel-react-best-practices");
        assert_eq!(summary.slug, "vercel-react-best-practices");
        assert_eq!(summary.source, "vercel-labs/agent-skills");
        assert_eq!(summary.installs, 799510);
        // Stars come from a later GitHub enrichment pass, not the search payload.
        assert_eq!(summary.stars, None);
        assert_eq!(summary.source_type, "github");
        assert_eq!(
            summary.install_url.as_deref(),
            Some("https://github.com/vercel-labs/agent-skills")
        );
        assert_eq!(
            summary.url,
            "https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices"
        );
    }

    #[test]
    fn derives_slug_from_id_when_skill_id_missing() {
        let skill = PublicSearchSkill {
            id: "expo/skills/react-native".to_string(),
            source: "expo/skills".to_string(),
            skill_id: String::new(),
            name: "React Native".to_string(),
            installs: 3842,
        };
        assert_eq!(public_skill_to_summary(&skill).slug, "react-native");
    }

    #[test]
    fn maps_well_known_sources() {
        let skill = PublicSearchSkill {
            id: "mintlify.com/mintlify".to_string(),
            source: "mintlify.com".to_string(),
            skill_id: "mintlify".to_string(),
            name: "mintlify".to_string(),
            installs: 10,
        };
        let summary = public_skill_to_summary(&skill);
        assert_eq!(summary.source_type, "well-known");
        assert_eq!(summary.install_url.as_deref(), Some("https://mintlify.com"));
    }

    #[test]
    fn key_precedence_is_explicit_then_env() {
        assert_eq!(
            pick_key(Some("  sk_live_1 "), Some("sk_live_2")).as_deref(),
            Some("sk_live_1")
        );
        assert_eq!(
            pick_key(Some("   "), Some("sk_live_2")).as_deref(),
            Some("sk_live_2")
        );
        assert_eq!(pick_key(None, None), None);
    }

    #[test]
    fn splits_github_detail_ids() {
        let (owner, repo, slug) = split_github_id("vercel-labs/skills/find-skills")
            .expect("github id splits");
        assert_eq!((owner.as_str(), repo.as_str(), slug.as_str()), ("vercel-labs", "skills", "find-skills"));
        assert!(split_github_id("mintlify.com/mintlify").is_none());
        assert!(split_github_id("a/b/c/d").is_none());
        assert!(split_github_id("").is_none());
    }

    #[test]
    fn splits_repo_sources() {
        assert_eq!(
            split_repo_source("vercel-labs/agent-skills"),
            Some(("vercel-labs", "agent-skills"))
        );
        assert_eq!(split_repo_source("mintlify.com"), None);
        assert_eq!(split_repo_source("owner/repo/extra"), None);
        assert_eq!(split_repo_source(""), None);
    }

    #[test]
    fn summary_deserializes_stars_aliases() {
        let summary: super::SkillSummary = serde_json::from_str(
            r#"{"id":"a/b/c","slug":"c","name":"c","source":"a/b","installs":10,"stargazers_count":123}"#,
        )
        .expect("stars alias parses");
        assert_eq!(summary.stars, Some(123));
        let missing: super::SkillSummary = serde_json::from_str(
            r#"{"id":"a/b/c","slug":"c","name":"c","source":"a/b","installs":10}"#,
        )
        .expect("missing stars parses");
        assert_eq!(missing.stars, None);
    }

    #[tokio::test]
    async fn trending_without_key_uses_marker_error() {
        let error = super::fetch_trending("trending", 1, 20, Some("   "))
            .await
            .expect_err("key-gated without a key");
        assert!(
            format!("{error:#}").starts_with(NEEDS_KEY_PREFIX),
            "unexpected message: {error:#}"
        );
    }

    #[tokio::test]
    async fn audit_without_key_uses_marker_error() {
        let error = super::fetch_audit("vercel-labs/skills/find-skills", None)
            .await
            .expect_err("key-gated without a key");
        assert!(
            format!("{error:#}").starts_with(NEEDS_KEY_PREFIX),
            "unexpected message: {error:#}"
        );
    }
}
