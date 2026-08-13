# Extend Claude with skills - Claude Code Docs

> Source: https://docs.anthropic.com/en/docs/claude-code/slash-commands
> Cached: 2026-08-12T22:56:26.798Z

---

## On this page

- [Bundled skills](#bundled-skills)
[Run and verify your app](#run-and-verify-your-app)

- [Getting started](#getting-started)
[Create your first skill](#create-your-first-skill)
- [Where skills live](#where-skills-live)
- [Live change detection](#live-change-detection)
- [Discovery from parent and nested directories](#discovery-from-parent-and-nested-directories)
- [Skills from additional directories](#skills-from-additional-directories)
- [Skills in Cowork and cloud sessions](#skills-in-cowork-and-cloud-sessions)
- [Skills synced from claude.ai](#how-synced-skills-behave)
- [Where synced skills load](#where-synced-skills-load)
- [When a synced skill name matches another command](#when-a-synced-skill-name-matches-another-command)
- [How Claude Code handles the frontmatter of a synced skill](#how-claude-code-handles-the-frontmatter-of-a-synced-skill)
- [How Claude Code handles the body of a synced skill](#how-claude-code-handles-the-body-of-a-synced-skill)

- [Configure skills](#configure-skills)
[Types of skill content](#types-of-skill-content)
- [Frontmatter reference](#frontmatter-reference)
- [Using skill frontmatter outside Claude Code](#using-skill-frontmatter-outside-claude-code)
- [How a skill gets its command name](#how-a-skill-gets-its-command-name)
- [Available string substitutions](#available-string-substitutions)
- [Add supporting files](#add-supporting-files)
- [Control who invokes a skill](#control-who-invokes-a-skill)
- [Skill content lifecycle](#skill-content-lifecycle)
- [Pre-approve tools for a skill](#pre-approve-tools-for-a-skill)
- [Pass arguments to skills](#pass-arguments-to-skills)

- [Advanced patterns](#advanced-patterns)
[Inject dynamic context](#inject-dynamic-context)
- [How injected commands run](#how-injected-commands-run)
- [When an injected command fails](#when-an-injected-command-fails)
- [Run skills in a subagent](#run-skills-in-a-subagent)
- [Example: Research skill using Explore agent](#example-research-skill-using-explore-agent)
- [Restrict Claude’s skill access](#restrict-claude%E2%80%99s-skill-access)
- [Override skill visibility from settings](#override-skill-visibility-from-settings)

- [Evaluate and iterate on a skill](#evaluate-and-iterate-on-a-skill)
[Run evals with skill-creator](#run-evals-with-skill-creator)

- [Share skills](#share-skills)
[Generate visual output](#generate-visual-output)

- [Troubleshooting](#troubleshooting)
[Skill not triggering](#skill-not-triggering)
- [Skill triggers too often](#skill-triggers-too-often)
- [Skill descriptions are cut short](#skill-descriptions-are-cut-short)

- [Related resources](#related-resources)

Skills# Extend Claude with skills

Copy pageCopy pageCreate, manage, and share skills to extend Claude’s capabilities in Claude Code. Includes custom commands and bundled skills.

Copy pageCopy pageSkills extend what Claude can do. Create a `SKILL.md` file with instructions, and Claude adds it to its toolkit. Claude uses skills when relevant, or you can invoke one directly with `/skill-name`.
Create a skill when you keep pasting the same instructions, checklist, or multi-step procedure into chat, or when a section of CLAUDE.md has grown into a procedure rather than a fact. Unlike CLAUDE.md content, a skill’s body loads only when it’s used, so long reference material costs almost nothing until you need it.
For built-in commands like `/help` and `/compact`, and bundled skills like `/debug` and `/code-review`, see the [commands reference](/docs/en/commands).**Custom commands have been merged into skills.** A file at `.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md` both create `/deploy` and work the same way. Your existing `.claude/commands/` files keep working. Skills add optional features: a directory for supporting files, frontmatter to [control whether you or Claude invokes them](#control-who-invokes-a-skill), and the ability for Claude to load them automatically when relevant.
Claude Code skills follow the [Agent Skills](https://agentskills.io) open standard, which works across multiple AI tools. Claude Code extends the standard with additional features like [invocation control](#control-who-invokes-a-skill), [subagent execution](#run-skills-in-a-subagent), and [dynamic context injection](#inject-dynamic-context). See [Using skill frontmatter outside Claude Code](#using-skill-frontmatter-outside-claude-code) for which frontmatter fields are part of the standard and which are Claude Code extensions.
## [​](#bundled-skills)Bundled skills

Claude Code includes a set of bundled skills, such as `/doctor`, `/code-review`, `/batch`, `/debug`, `/loop`, and `/claude-api`. Bundled skills are prompt-based: they give Claude detailed instructions and let it orchestrate the work using its tools. Most built-in commands instead execute fixed logic directly.
You invoke a bundled skill the same way as any other skill, by typing `/` followed by the skill name. Claude invokes some bundled skills automatically when relevant; others, including `/verify`, run only when you invoke them, which keeps you in control of when these longer-running checks spend time and tokens. Before v2.1.215, Claude could also run `/verify` on its own.
Bundled skills are available in every session. To turn them off, use the [`disableBundledSkills`](/docs/en/settings#available-settings) setting, which disables every bundled skill except `/doctor`.
The [`/doctor`](/docs/en/commands#all-commands) setup checkup stays typable when `disableBundledSkills` is on, in Claude Code v2.1.205 and later. To hide it, set the `DISABLE_DOCTOR_COMMAND` environment variable or a [`skillOverrides`](#override-skill-visibility-from-settings) entry of `"doctor": "off"`. Before v2.1.205, `/doctor` was a built-in command rather than a bundled skill.
Bundled skills are listed alongside built-in commands in the [commands reference](/docs/en/commands), marked **Skill** in the Purpose column.
### [​](#run-and-verify-your-app)Run and verify your app

Three bundled skills work together to launch your app and confirm changes against the running app instead of just tests:
SkillPurpose`/run`Launch and drive your app to see a change working`/verify`Build and run your app to confirm a code change does what it should, without falling back to tests or type checks`/run-skill-generator`Teach `/run` and `/verify` how to build and launch your project
All three skills require Claude Code v2.1.145 or later. Check your version with `claude --version` or the `/status` command.
`/run` and `/verify` work without setup. They infer the launch from your project type (CLI, server, TUI, browser-driven) and from what’s in your README, `package.json`, or `Makefile`. That inference gets unreliable for projects that need anything beyond a standard launch: a database, an env file, a graphical session, a multi-step build.
`/run-skill-generator` records the recipe instead. It gets your app running from a clean environment, captures what worked (the install commands, the env vars, the launch script), and commits it as a per-project skill at `.claude/skills/run-<name>/`. After that, `/run`, `/verify`, and any other agent in the repo follow the recorded recipe instead of rediscovering it. Run `/run-skill-generator` once per project, and again if the build or launch process changes.
`/verify` can also record its own recipe. When it has to build and drive your app without a recorded recipe, it writes what worked to `.claude/skills/verify/SKILL.md` at the repo root, or in the touched package directory in a monorepo, so later runs and other agents follow the same steps. At the repo root, the recorded skill replaces the bundled `/verify`. This requires Claude Code v2.1.200 or later.
Claude edits the recorded file only when it steered a run wrong, such as a command that failed or a missing step, so you can commit the file without per-session diffs. Before v2.1.205, the bundled skill told Claude to fold in anything a run learned, which caused frequent merge conflicts.
## [​](#getting-started)Getting started

### [​](#create-your-first-skill)Create your first skill

This example creates a skill that summarizes the uncommitted changes in your git repository and flags anything risky. It pulls the live diff into the prompt before Claude reads it, so the response is grounded in your actual working tree rather than what Claude can guess from open files. Claude loads the skill automatically when you ask about your changes, or you can invoke it directly with `/summarize-changes`.
1Create the skill directory

Create a directory for the skill in your personal skills folder. Personal skills are available across all your projects.```
mkdir -p ~/.claude/skills/summarize-changes

```

2Write SKILL.md

Every skill needs a `SKILL.md` file with two parts: YAML frontmatter between `---` markers that tells Claude when to use the skill, and markdown content with the instructions Claude follows when the skill runs. The directory name becomes the command you type, and the `description` helps Claude decide when to load the skill automatically.Save this to `~/.claude/skills/summarize-changes/SKILL.md`:```
---
description: Summarizes uncommitted changes and flags anything risky. Use when the user asks what changed, wants a commit message, or asks to review their diff.
---

## Current changes

!`git diff HEAD`

## Instructions

Summarize the changes above in two or three bullet points, then list any risks you notice such as missing error handling, hardcoded values, or tests that need updating. If the diff is empty, say there are no uncommitted changes.

```

The `!`git diff HEAD`` line uses [dynamic context injection](#inject-dynamic-context): Claude Code runs the command and replaces the line with its output before Claude sees the skill content, so the instructions arrive with the current diff already inlined.3Test the skill

Open a git project, make a small edit to any file, and start Claude Code by running `claude`. You can test the skill two ways.**Let Claude invoke it automatically** by asking something that matches the description:```
What did I change?

```

**Or invoke it directly** with the skill name:```
/summarize-changes

```

Either way, Claude should respond with a short summary of your edit and a list of risks.
### [​](#where-skills-live)Where skills live

Where you store a skill determines who can use it:
LocationPathApplies toEnterpriseSee [managed settings](/docs/en/settings#settings-files)All users in your organizationPersonal`~/.claude/skills/<skill-name>/SKILL.md`All your projectsProject`.claude/skills/<skill-name>/SKILL.md`This project onlyPlugin`<plugin>/skills/<skill-name>/SKILL.md`Where plugin is enabled
When skills share the same name, Claude Code resolves the conflict by source:

Across levels, enterprise overrides personal, and personal overrides project.

- For example, with a `deploy` skill in both `~/.claude/skills/` and your project’s `.claude/skills/`, `/deploy` runs the personal one.

A skill at any of these levels also overrides a bundled skill with the same name.

- For example, a `code-review` skill in your project’s `.claude/skills/` replaces the bundled `/code-review`.

Plugin skills use a `plugin-name:skill-name` namespace, so they can’t conflict with other levels.

- For example, `my-plugin/skills/deploy/SKILL.md` becomes `/my-plugin:deploy` and loads alongside a `deploy` skill in your project’s `.claude/skills/`.

If you have files in `.claude/commands/`, those work the same way, but if a skill and a command share the same name, the skill takes precedence.

- For example, with both `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md`, `/deploy` runs the skill.

A skill or command from any of these sources overrides a skill [synced from your claude.ai account](#when-a-synced-skill-name-matches-another-command) with the same name.

- For example, with a `deploy` skill enabled on claude.ai and another in your project’s `.claude/skills/`, `/deploy` runs the project one.

Skills also load from nested `.claude/skills/` directories below your working directory. When Claude reads or edits a file in a subdirectory, skills from that subdirectory’s `.claude/skills/` become available. This lets a monorepo package provide its own skills that apply when working on that package, even if the session started at the repo root.
If a nested skill shares a name with another skill, both stay available. For example, with a `deploy` skill at the project root and another in `apps/web/.claude/skills/`:

- The nested one appears under a directory-qualified name, `apps/web:deploy`.

- Its description says which directory it applies to.

- Claude picks the variant that matches the files it is working on.

Typing `/deploy` runs the project-root skill. Type the qualified name `/apps/web:deploy` to run the nested variant explicitly.
When you or Claude invoke the unqualified name, the project-root skill loads, and Claude Code appends a list of the directory-qualified variants to its content with an instruction to also invoke any variant whose directory holds the files Claude is working on. A nested skill therefore still applies to work in its directory when only the unqualified name is invoked. Requires Claude Code v2.1.203 or later.
The folder name `synced` is reserved in the enterprise, personal, and project skills locations, in any capitalization. Claude Code [downloads the skills you enable on claude.ai](/docs/en/env-vars#variables) into `~/.claude/skills/synced/` when `CLAUDE_CODE_SYNC_SKILLS` is set in non-interactive mode, and skips a skill you author at that name. Before v2.1.227, a folder named `synced` loaded as a skill.
A `<skill-name>` entry in the enterprise, personal, or project locations can be a symlink to a directory elsewhere on disk. Claude Code follows the symlink and reads `SKILL.md` from the target directory, and if the same target is reachable from more than one location, Claude Code loads the skill once. Plugin skills handle symlinks differently; see [Share files within a marketplace with symlinks](/docs/en/plugins-reference#share-files-within-a-marketplace-with-symlinks).
Add a `.claude-plugin/plugin.json` to a skill folder and it loads as a [plugin](/docs/en/plugins-reference#skills-directory-plugins) named `<name>@skills-dir`, so it can bundle agents, hooks, and MCP servers. In a project’s `.claude/skills/`, this requires accepting the workspace trust dialog first.
#### [​](#live-change-detection)Live change detection

Claude Code watches skill directories for file changes. When you add, edit, or remove a skill under `~/.claude/skills/`, the project `.claude/skills/`, or a `.claude/skills/` inside an `--add-dir` directory, Claude Code picks up the change within the current session, without a restart. If you create a top-level skills directory that didn’t exist when the session started, restart Claude Code so it can watch the new directory.
Live change detection covers `SKI

... [Content truncated]