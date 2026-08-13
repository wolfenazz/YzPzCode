# GitHub - google-gemini/gemini-cli: An open-source AI agent that brings the power of Gemini directly into your terminal. · GitHub

> Source: https://github.com/google-gemini/gemini-cli
> Cached: 2026-08-12T22:57:15.137Z

---

# Gemini CLI

[](#gemini-cli)
[](https://github.com/google-gemini/gemini-cli/actions/workflows/ci.yml)
[](https://github.com/google-gemini/gemini-cli/actions/workflows/chained_e2e.yml)
[](https://www.npmjs.com/package/@google/gemini-cli)
[](https://github.com/google-gemini/gemini-cli/blob/main/LICENSE)
[](https://codewiki.google/github.com/google-gemini/gemini-cli?utm_source=badge&utm_medium=github&utm_campaign=github.com/google-gemini/gemini-cli)
[](/google-gemini/gemini-cli/blob/main/docs/assets/gemini-screenshot.png)

Gemini CLI is an open-source AI agent that brings the power of Gemini directly
into your terminal. It provides lightweight access to Gemini, giving you the
most direct path from your prompt to our model.
Learn all about Gemini CLI in our [documentation](https://geminicli.com/docs/).

## 🚀 Why Gemini CLI?

[](#-why-gemini-cli)

**🎯 Free tier**: 60 requests/min and 1,000 requests/day with personal Google
account.
**🧠 Powerful Gemini 3 models**: Access to improved reasoning and 1M token
context window.
**🔧 Built-in tools**: Google Search grounding, file operations, shell
commands, web fetching.
**🔌 Extensible**: MCP (Model Context Protocol) support for custom
integrations.
- **💻 Terminal-first**: Designed for developers who live in the command line.

- **🛡️ Open source**: Apache 2.0 licensed.

## 📦 Installation

[](#-installation)
See
[Gemini CLI installation, execution, and releases](https://www.geminicli.com/docs/get-started/installation)
for recommended system specifications and a detailed installation guide.
### Quick Install

[](#quick-install)
#### Run instantly with npx

[](#run-instantly-with-npx)
# Using npx (no installation required)
npx @google/gemini-cli
#### Install globally with npm

[](#install-globally-with-npm)
npm install -g @google/gemini-cli
#### Install globally with Homebrew (macOS/Linux)

[](#install-globally-with-homebrew-macoslinux)
brew install gemini-cli
#### Install globally with MacPorts (macOS)

[](#install-globally-with-macports-macos)
sudo port install gemini-cli
#### Install with Anaconda (for restricted environments)

[](#install-with-anaconda-for-restricted-environments)
# Create and activate a new environment
conda create -y -n gemini_env -c conda-forge nodejs
conda activate gemini_env

# Install Gemini CLI globally via npm (inside the environment)
npm install -g @google/gemini-cli
## Release Channels

[](#release-channels)
See [Releases](https://www.geminicli.com/docs/changelogs) for more details.

### Preview

[](#preview)
New preview releases will be published each week at UTC 23:59 on Tuesdays. These
releases will not have been fully vetted and may contain regressions or other
outstanding issues. Please help us test and install with `preview` tag.
npm install -g @google/gemini-cli@preview
### Stable

[](#stable)

New stable releases will be published each week at UTC 20:00 on Tuesdays, this
will be the full promotion of last week's `preview` release + any bug fixes
and validations. Use `latest` tag.

npm install -g @google/gemini-cli@latest
### Nightly

[](#nightly)

New releases will be published each day at UTC 00:00. This will be all changes
from the main branch as represented at time of release. It should be assumed
there are pending validations and issues. Use `nightly` tag.

npm install -g @google/gemini-cli@nightly
## 📋 Key Features

[](#-key-features)
### Code Understanding & Generation

[](#code-understanding--generation)

- Query and edit large codebases

- Generate new apps from PDFs, images, or sketches using multimodal capabilities

- Debug issues and troubleshoot with natural language

### Automation & Integration

[](#automation--integration)

Automate operational tasks like querying pull requests or handling complex
rebases
Use MCP servers to connect new capabilities, including
[media generation with Imagen, Veo or Lyria](https://github.com/GoogleCloudPlatform/vertex-ai-creative-studio/tree/main/experiments/mcp-genmedia)
- Run non-interactively in scripts for workflow automation

### Advanced Capabilities

[](#advanced-capabilities)

Ground your queries with built-in
[Google Search](https://ai.google.dev/gemini-api/docs/grounding) for real-time
information
- Conversation checkpointing to save and resume complex sessions

- Custom context files (GEMINI.md) to tailor behavior for your projects

### GitHub Integration

[](#github-integration)
Integrate Gemini CLI directly into your GitHub workflows with
[**Gemini CLI GitHub Action**](https://github.com/google-github-actions/run-gemini-cli):

**Pull Request Reviews**: Automated code review with contextual feedback and
suggestions
**Issue Triage**: Automated labeling and prioritization of GitHub issues based
on content analysis
**On-demand Assistance**: Mention `@gemini-cli` in issues and pull requests
for help with debugging, explanations, or task delegation
**Custom Workflows**: Build automated, scheduled and on-demand workflows
tailored to your team's needs

## 🔐 Authentication Options

[](#-authentication-options)
Choose the authentication method that best fits your needs:

### Option 1: Sign in with Google (OAuth login using your Google Account)

[](#option-1-sign-in-with-google-oauth-login-using-your-google-account)
**✨ Best for:** Individual developers as well as anyone who has a Gemini Code
Assist License. (see
[quota limits and terms of service](https://cloud.google.com/gemini/docs/quotas)
for details)
**Benefits:**

- **Free tier**: 60 requests/min and 1,000 requests/day

- **Gemini 3 models** with 1M token context window

- **No API key management** - just sign in with your Google account

- **Automatic updates** to latest models

#### Start Gemini CLI, then choose *Sign in with Google* and follow the browser authentication flow when prompted

[](#start-gemini-cli-then-choose-sign-in-with-google-and-follow-the-browser-authentication-flow-when-prompted)
gemini
#### If you are using a paid Code Assist License from your organization, remember to set the Google Cloud Project

[](#if-you-are-using-a-paid-code-assist-license-from-your-organization-remember-to-set-the-google-cloud-project)
# Set your Google Cloud Project
export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
gemini
### Option 2: Gemini API Key

[](#option-2-gemini-api-key)
**✨ Best for:** Developers who need specific model control or paid tier access

**Benefits:**

- **Free tier**: 1000 requests/day with Gemini 3 (mix of flash and pro)

- **Model selection**: Choose specific Gemini models

- **Usage-based billing**: Upgrade for higher limits when needed

# Get your key from https://aistudio.google.com/apikey
export GEMINI_API_KEY="YOUR_API_KEY"
gemini
### Option 3: Vertex AI

[](#option-3-vertex-ai)
**✨ Best for:** Enterprise teams and production workloads

**Benefits:**

- **Enterprise features**: Advanced security and compliance

- **Scalable**: Higher rate limits with billing account

- **Integration**: Works with existing Google Cloud infrastructure

# Get your key from Google Cloud Console
export GOOGLE_API_KEY="YOUR_API_KEY"
export GOOGLE_GENAI_USE_VERTEXAI=true
gemini
For Google Workspace accounts and other authentication methods, see the
[authentication guide](https://www.geminicli.com/docs/get-started/authentication).
## 🚀 Getting Started

[](#-getting-started)
### Basic Usage

[](#basic-usage)
#### Start in current directory

[](#start-in-current-directory)
gemini
#### Include multiple directories

[](#include-multiple-directories)
gemini --include-directories ../lib,../docs
#### Use specific model

[](#use-specific-model)
gemini -m gemini-2.5-flash
#### Non-interactive mode for scripts

[](#non-interactive-mode-for-scripts)
Get a simple text response:

gemini -p "Explain the architecture of this codebase"
For more advanced scripting, including how to parse JSON and handle errors, use
the `--output-format json` flag to get structured output:
gemini -p "Explain the architecture of this codebase" --output-format json
For real-time event streaming (useful for monitoring long-running operations),
use `--output-format stream-json` to get newline-delimited JSON events:
gemini -p "Run tests and deploy" --output-format stream-json
### Quick Examples

[](#quick-examples)
#### Start a new project

[](#start-a-new-project)
cd new-project/
gemini
> Write me a Discord bot that answers questions using a FAQ.md file I will provide
#### Analyze existing code

[](#analyze-existing-code)
git clone https://github.com/google-gemini/gemini-cli
cd gemini-cli
gemini
> Give me a summary of all of the changes that went in yesterday
## 📚 Documentation

[](#-documentation)
### Getting Started

[](#getting-started)

[**Quickstart Guide**](https://www.geminicli.com/docs/get-started) - Get up
and running quickly.
[**Authentication Setup**](https://www.geminicli.com/docs/get-started/authentication) -
Detailed auth configuration.
[**Configuration Guide**](https://www.geminicli.com/docs/reference/configuration) -
Settings and customization.
[**Keyboard Shortcuts**](https://www.geminicli.com/docs/reference/keyboard-shortcuts) -
Productivity tips.

### Core Features

[](#core-features)

[**Commands Reference**](https://www.geminicli.com/docs/reference/commands) -
All slash commands (`/help`, `/chat`, etc).
[**Custom Commands**](https://www.geminicli.com/docs/cli/custom-commands) -
Create your own reusable commands.
[**Context Files (GEMINI.md)**](https://www.geminicli.com/docs/cli/gemini-md) -
Provide persistent context to Gemini CLI.
[**Checkpointing**](https://www.geminicli.com/docs/cli/checkpointing) - Save
and resume conversations.
[**Token Caching**](https://www.geminicli.com/docs/cli/token-caching) -
Optimize token usage.

### Tools & Extensions

[](#tools--extensions)

[**Built-in Tools Overview**](https://www.geminicli.com/docs/reference/tools)

- [File System Operations](https://www.geminicli.com/docs/tools/file-system)

- [Shell Commands](https://www.geminicli.com/docs/tools/shell)

- [Web Fetch & Search](https://www.geminicli.com/docs/tools/web-fetch)

[**MCP Server Integration**](https://www.geminicli.com/docs/tools/mcp-server) -
Extend with custom tools.
[**Custom Extensions**](https://geminicli.com/docs/extensions/writing-extensions) -
Build and share your own commands.

### Advanced Topics

[](#advanced-topics)

[**Headless Mode (Scripting)**](https://www.geminicli.com/docs/cli/headless) -
Use Gemini CLI in automated workflows.
[**IDE Integration**](https://www.geminicli.com/docs/ide-integration) - VS
Code companion.
[**Sandboxing & Security**](https://www.geminicli.com/docs/cli/sandbox) - Safe
execution environments.
[**Trusted Folders**](https://www.geminicli.com/docs/cli/trusted-folders) -
Control execution policies by folder.
[**Enterprise Guide**](https://www.geminicli.com/docs/cli/enterprise) - Deploy
and manage in a corporate environment.
[**Telemetry & Monitoring**](https://www.geminicli.com/docs/cli/telemetry) -
Usage tracking.
[**Tools reference**](https://www.geminicli.com/docs/reference/tools) -
Built-in tools overview.
[**Local development**](https://www.geminicli.com/docs/local-development) -
Local development tooling.

### Troubleshooting & Support

[](#troubleshooting--support)

[**Troubleshooting Guide**](https://www.geminicli.com/docs/resources/troubleshooting) -
Common issues and solutions.
[**FAQ**](https://www.geminicli.com/docs/resources/faq) - Frequently asked
questions.
- Use `/bug` command to report issues directly from the CLI.

### Using MCP Servers

[](#using-mcp-servers)
Configure MCP servers in `~/.gemini/settings.json` to extend Gemini CLI with
custom tools:
```
> @github List my open pull requests
> @slack Send a summary of today's commits to #dev channel
> @database Run a query to find inactive users

```

See the
[MCP Server Integration guide](https://www.geminicli.com/docs/tools/mcp-server)
for setup instructions.
## 🤝 Contributing

[](#-contributing)
We welcome contributions! Gemini CLI is fully open source (Apache 2.0), and we
encourage the community to:

- Report bugs and suggest features.

- Improve documentation.

- Submit code improvements.

- Share your MCP servers and extensions.

See our [Contributing Guide](/google-gemini/gemini-cli/blob/main/CONTRIBUTING.md) for development setup, coding
standards, and how to submit pull requests.
Check our [Official Roadmap](https://github.com/orgs/google-gemini/projects/11)
for planned features and priorities.
## 📖 Resources

[](#-resources)

**[Free Course](https://learn.deeplearning.ai/courses/gemini-cli-code-and-create-with-an-open-source-agent/information)** -
Learn the basics.
- **[Official Roadmap](/google-gemini/gemini-cli/blob/main/ROADMAP.md)** - See what's coming next.

**[Changelog](https://www.geminicli.com/docs/changelogs)** - See recent
notable updates.
**[NPM Package](https://www.npmjs.com/package/@google/gemini-cli)** - Package
registry.
**[GitHub Issues](https://github.com/google-gemini/gemini-cli/issues)** -
Report bugs or request features.
**[Security Advisories](https://github.com/google-gemini/gemini-cli/security/advisories)** -
Security updates.

### Uninstall

[](#uninstall)
See the [Uninstall Guide](https://www.geminicli.com/docs/resources/uninstall)
for removal instructions.
## 📄 Legal

[](#-legal)

- **License**: [Apache License 2.0](/google-gemini/gemini-cli/blob/main/LICENSE)

**Terms of Service**:
[Terms & Privacy](https://www.geminicli.com/docs/resources/tos-privacy)
- **Security**: [Security Policy](/google-gemini/gemini-cli/blob/main/SECURITY.md)

 
  
   
   
   
  
 

  Built with ❤️ by Google and the open source community