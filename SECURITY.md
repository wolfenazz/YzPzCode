# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability, please report it responsibly.

### How to Report

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please:

1. **Email us at:** Create an issue with the label `security` on our [GitHub Issues](https://github.com/wolfenazz/YzPzCode/issues) (we'll make it private if needed)
2. **Or DM us on Discord:**
   - Naseem: `@ws.`
   - Noor: `@sjc0`

### What to Include

Please provide:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### Response Timeline

| Stage | Timeline |
|-------|----------|
| Initial response | Within 48 hours |
| Vulnerability confirmation | Within 7 days |
| Fix development | Depends on severity |
| Patch release | As soon as possible |

## Security Best Practices

When using YzPzCode:

- **API Keys:** Never share your AI CLI API keys. YzPzCode does not store or transmit your keys — they remain local to your machine.
- **Workspace Paths:** Be mindful of which directories you open in the app.
- **Updates:** Keep the app updated to receive security patches.
- **Downloads:** Only download YzPzCode from our official [GitHub Releases](https://github.com/wolfenazz/YzPzCode/releases).

## Known Security Considerations

### Unsigned macOS App

The macOS version is currently unsigned due to Apple Developer certification being in progress. This means:

- macOS will show a security warning on first launch
- You'll need to bypass Gatekeeper (see [README.md](README.md#macos-users))
- The app is built from this open-source repository and is safe to run

We are actively working on code-signing and expect it to be completed within a few weeks.

### Terminal Access

YzPzCode spawns real PTY (pseudo-terminal) sessions to run AI CLI tools. This means:

- The app has terminal-level access to your system
- Only use AI CLIs from trusted sources
- Be cautious with commands suggested by AI agents

## Third-Party Dependencies

YzPzCode relies on:
- [Tauri v2](https://tauri.app) — Application framework
- [portable-pty](https://github.com/wez/wezterm/tree/main/pty) — Terminal emulation
- AI CLI tools (Claude, Gemini, Codex, etc.) — Each has their own security policies

## Disclosure Policy

We follow responsible disclosure:
- Vulnerabilities are disclosed after a fix is released
- Credit is given to reporters (unless they prefer to remain anonymous)
- CVEs will be requested for significant vulnerabilities

---

**Questions?** Reach out via [GitHub Issues](https://github.com/wolfenazz/YzPzCode/issues) or Discord.

*Last updated: March 2026*
