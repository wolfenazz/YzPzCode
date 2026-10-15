use anyhow::Context;

use super::types::SkillFile;

const GITHUB_API_BASE: &str = "https://api.github.com";
const GITHUB_RAW_BASE: &str = "https://raw.githubusercontent.com";
/// SKILL.md previews stay small; refuse anything suspiciously large.
const MAX_PREVIEW_BYTES: usize = 512 * 1024;

/// Optional GitHub token for a higher rate limit, mirroring the `skills` CLI
/// (`GITHUB_TOKEN`, falling back to `GH_TOKEN`). Unauthenticated callers still
/// get 60 requests/hour, which is plenty for on-demand SKILL.md previews.
fn github_token() -> Option<String> {
    for name in ["GITHUB_TOKEN", "GH_TOKEN"] {
        if let Ok(value) = std::env::var(name) {
            let trimmed = value.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    None
}

fn github_client() -> anyhow::Result<reqwest::Client> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("application/vnd.github+json"),
    );
    if let Some(token) = github_token() {
        let value = format!("Bearer {token}");
        headers.insert(
            reqwest::header::AUTHORIZATION,
            reqwest::header::HeaderValue::from_str(&value)
                .context("stored GitHub token is not a valid header value")?,
        );
    }
    reqwest::Client::builder()
        .user_agent("YzPzCode")
        .timeout(std::time::Duration::from_secs(15))
        .default_headers(headers)
        .build()
        .context("failed to build GitHub HTTP client")
}

#[derive(Debug, serde::Deserialize)]
struct GitTree {
    #[serde(default)]
    tree: Vec<GitTreeEntry>,
}

#[derive(Debug, serde::Deserialize)]
struct GitTreeEntry {
    #[serde(default)]
    path: String,
}

#[derive(Debug, serde::Deserialize)]
struct RepoInfo {
    #[serde(default, alias = "stargazers_count")]
    stargazers_count: Option<i64>,
}

/// Best-effort GitHub stars for a `owner/repo` source. Returns `None` on any
/// failure (not found, rate-limited, offline) so catalog calls never fail
/// just because stars are unavailable.
pub async fn fetch_repo_stars(owner: &str, repo: &str) -> Option<i64> {
    let http = github_client().ok()?;
    let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo}");
    let response = http.get(&url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let info = response.json::<RepoInfo>().await.ok()?;
    info.stargazers_count.filter(|stars| *stars >= 0)
}

/// Pick the `SKILL.md` path that belongs to `slug` from a recursive git-tree
/// listing. The skill directory name must equal the slug (case-insensitive);
/// the shallowest match wins and ties break alphabetically for determinism.
pub fn pick_skill_md<'a>(paths: &'a [String], slug: &str) -> Option<&'a str> {
    let mut best: Option<(&'a str, usize)> = None;
    for path in paths {
        if !path.to_lowercase().ends_with("/skill.md") {
            continue;
        }
        let parent = path.rsplit('/').nth(1).unwrap_or("");
        if !parent.eq_ignore_ascii_case(slug) {
            continue;
        }
        let depth = path.matches('/').count();
        let replace = match best {
            None => true,
            Some((best_path, best_depth)) => {
                depth < best_depth || (depth == best_depth && path.as_str() < best_path)
            }
        };
        if replace {
            best = Some((path.as_str(), depth));
        }
    }
    best.map(|(path, _)| path)
}

async fn tree_paths(
    http: &reqwest::Client,
    owner: &str,
    repo: &str,
) -> anyhow::Result<(Vec<String>, String)> {
    let mut last_error = anyhow::anyhow!("GitHub repository {owner}/{repo} was not found");
    for branch in ["main", "master"] {
        let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1");
        let response = http
            .get(&url)
            .send()
            .await
            .with_context(|| format!("failed to list files in {owner}/{repo}"))?;
        let status = response.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            last_error =
                anyhow::anyhow!("GitHub repository {owner}/{repo} was not found (tried '{branch}')");
            continue;
        }
        if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            anyhow::bail!(
                "GitHub rate limit reached while reading {owner}/{repo}. Set GITHUB_TOKEN and try again."
            );
        }
        if !status.is_success() {
            anyhow::bail!("GitHub request failed ({status}) while reading {owner}/{repo}");
        }
        let tree = response
            .json::<GitTree>()
            .await
            .with_context(|| format!("failed to decode file listing for {owner}/{repo}"))?;
        let paths = tree
            .tree
            .into_iter()
            .map(|entry| entry.path)
            .filter(|path| !path.trim().is_empty())
            .collect::<Vec<_>>();
        return Ok((paths, branch.to_string()));
    }
    Err(last_error)
}

/// Fetch the `SKILL.md` preview for a `owner/repo` + `slug` skill straight from
/// the public repository. Key-free fallback for the authenticated detail API.
pub async fn fetch_skill_preview(
    owner: &str,
    repo: &str,
    slug: &str,
) -> anyhow::Result<Vec<SkillFile>> {
    let http = github_client()?;
    let (paths, branch) = tree_paths(&http, owner, repo).await?;
    let Some(skill_path) = pick_skill_md(&paths, slug) else {
        anyhow::bail!("No SKILL.md for '{slug}' found in {owner}/{repo}");
    };
    let url = format!("{GITHUB_RAW_BASE}/{owner}/{repo}/{branch}/{skill_path}");
    let response = http
        .get(&url)
        .send()
        .await
        .with_context(|| format!("failed to download {skill_path} from {owner}/{repo}"))?;
    if !response.status().is_success() {
        anyhow::bail!(
            "Could not download {skill_path} from {owner}/{repo} ({})",
            response.status()
        );
    }
    if let Some(len) = response.content_length() {
        if len > MAX_PREVIEW_BYTES as u64 {
            anyhow::bail!("{skill_path} in {owner}/{repo} is too large to preview");
        }
    }
    let bytes = response
        .bytes()
        .await
        .with_context(|| format!("failed to read {skill_path} from {owner}/{repo}"))?;
    if bytes.len() > MAX_PREVIEW_BYTES {
        anyhow::bail!("{skill_path} in {owner}/{repo} is too large to preview");
    }
    let contents = String::from_utf8(bytes.to_vec())
        .with_context(|| format!("{skill_path} in {owner}/{repo} is not valid UTF-8"))?;
    Ok(vec![SkillFile {
        path: skill_path.to_string(),
        contents,
    }])
}

#[cfg(test)]
mod tests {
    use super::pick_skill_md;

    fn paths(list: &[&str]) -> Vec<String> {
        list.iter().map(|entry| entry.to_string()).collect()
    }

    #[test]
    fn picks_shallowest_skill_md_for_slug() {
        let listing = paths(&[
            "skills/category/my-skill/SKILL.md",
            "skills/my-skill/SKILL.md",
            "skills/my-skill/extra/SKILL.md",
        ]);
        assert_eq!(
            pick_skill_md(&listing, "my-skill"),
            Some("skills/my-skill/SKILL.md")
        );
    }

    #[test]
    fn matches_slug_case_insensitively() {
        let listing = paths(&["skills/My-Skill/SKILL.md"]);
        assert_eq!(pick_skill_md(&listing, "my-skill"), Some("skills/My-Skill/SKILL.md"));
    }

    #[test]
    fn ignores_other_skills_and_non_skill_files() {
        let listing = paths(&[
            "skills/other-skill/SKILL.md",
            "skills/my-skill/README.md",
            "SKILL.md",
        ]);
        assert_eq!(pick_skill_md(&listing, "my-skill"), None);
    }

    #[test]
    fn breaks_depth_ties_alphabetically() {
        let listing = paths(&["b/my-skill/SKILL.md", "a/my-skill/SKILL.md"]);
        assert_eq!(pick_skill_md(&listing, "my-skill"), Some("a/my-skill/SKILL.md"));
    }
}
