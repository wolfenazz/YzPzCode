# Agent Skills | OpenCode

> Source: https://opencode.ai/docs/skills
> Cached: 2026-08-14T14:50:16.253Z

---

# Agent Skills

Define reusable behavior via SKILL.md definitions

       Agent skills let OpenCode discover reusable instructions from your repo or home directory.
Skills are loaded on-demand via the native `skill` tool—agents see available skills and can load the full content when needed.

## [Place files](#place-files)

Create one folder per skill name and put a `SKILL.md` inside it.
OpenCode searches these locations:

- Project config: `.opencode/skills/&#x3C;name>/SKILL.md`

- Global config: `~/.config/opencode/skills/&#x3C;name>/SKILL.md`

- Project Claude-compatible: `.claude/skills/&#x3C;name>/SKILL.md`

- Global Claude-compatible: `~/.claude/skills/&#x3C;name>/SKILL.md`

- Project agent-compatible: `.agents/skills/&#x3C;name>/SKILL.md`

- Global agent-compatible: `~/.agents/skills/&#x3C;name>/SKILL.md`

## [Understand discovery](#understand-discovery)

For project-local paths, OpenCode walks up from your current working directory until it reaches the git worktree.
It loads any matching `skills/*/SKILL.md` in `.opencode/` and any matching `.claude/skills/*/SKILL.md` or `.agents/skills/*/SKILL.md` along the way.
Global definitions are also loaded from `~/.config/opencode/skills/*/SKILL.md`, `~/.claude/skills/*/SKILL.md`, and `~/.agents/skills/*/SKILL.md`.

## [Write frontmatter](#write-frontmatter)

Each `SKILL.md` must start with YAML frontmatter.
Only these fields are recognized:

- `name` (required)

- `description` (required)

- `license` (optional)

- `compatibility` (optional)

- `metadata` (optional, string-to-string map)

Unknown frontmatter fields are ignored.

## [Validate names](#validate-names)

`name` must:

- Be 1–64 characters

- Be lowercase alphanumeric with single hyphen separators

- Not start or end with `-`

- Not contain consecutive `--`

- Match the directory name that contains `SKILL.md`

Equivalent regex:

```
^[a-z0-9]+(-[a-z0-9]+)*$
```

## [Follow length rules](#follow-length-rules)

`description` must be 1-1024 characters.
Keep it specific enough for the agent to choose correctly.

## [Use an example](#use-an-example)

Create `.opencode/skills/git-release/SKILL.md` like this:

```
---name: git-releasedescription: Create consistent releases and changelogslicense: MITcompatibility: opencodemetadata:  audience: maintainers  workflow: github---
## What I do
- Draft release notes from merged PRs- Propose a version bump- Provide a copy-pasteable `gh release create` command
## When to use me
Use this when you are preparing a tagged release.Ask clarifying questions if the target versioning scheme is unclear.
```

## [Recognize tool description](#recognize-tool-description)

OpenCode lists available skills in the `skill` tool description.
Each entry includes the skill name and description:
```
&#x3C;available_skills>  &#x3C;skill>    &#x3C;name>git-release&#x3C;/name>    &#x3C;description>Create consistent releases and changelogs&#x3C;/description>  &#x3C;/skill>&#x3C;/available_skills>
```

      git-release    Create consistent releases and changelogs  ">
The agent loads a skill by calling the tool:

```
skill({ name: "git-release" })
```

## [Configure permissions](#configure-permissions)

Control which skills agents can access using pattern-based permissions in `opencode.json`:

```
{  "permission": {    "skill": {      "*": "allow",      "pr-review": "allow",      "internal-*": "deny",      "experimental-*": "ask"    }  }}
```

PermissionBehavior`allow`Skill loads immediately`deny`Skill hidden from agent, access rejected`ask`User prompted for approval before loading
Patterns support wildcards: `internal-*` matches `internal-docs`, `internal-tools`, etc.

## [Override per agent](#override-per-agent)

Give specific agents different permissions than the global defaults.

**For custom agents** (in agent frontmatter):

```
---permission:  skill:    "documents-*": "allow"---
```

**For built-in agents** (in `opencode.json`):

```
{  "agent": {    "plan": {      "permission": {        "skill": {          "internal-*": "allow"        }      }    }  }}
```

## [Disable the skill tool](#disable-the-skill-tool)

Completely disable skills for agents that shouldn’t use them:

**For custom agents**:

```
---tools:  skill: false---
```

**For built-in agents**:

```
{  "agent": {    "plan": {      "tools": {        "skill": false      }    }  }}
```

When disabled, the `&#x3C;available_skills>` section is omitted entirely.

## [Troubleshoot loading](#troubleshoot-loading)

If a skill does not show up:

- Verify `SKILL.md` is spelled in all caps

- Check that frontmatter includes `name` and `description`

- Ensure skill names are unique across all locations

- Check permissions—skills with `deny` are hidden from agents

  [Edit page](https://github.com/anomalyco/opencode/edit/dev/packages/web/src/content/docs/skills.mdx)[Found a bug? Open an issue](https://github.com/anomalyco/opencode/issues/new)[Join our Discord community](https://opencode.ai/discord)  Select language   EnglishالعربيةBosanskiDanskDeutschEspañolFrançaisItaliano日本語한국어Norsk BokmålPolskiPortuguês (Brasil)РусскийไทยTürkçe简体中文繁體中文       &copy; [Anomaly](https://anoma.ly)

Last updated: Aug 14, 2026