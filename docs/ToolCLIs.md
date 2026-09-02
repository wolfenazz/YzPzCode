# YzPzCode Tool CLIs

YzPzCode detects, authenticates, and launches 10 SaaS tool CLIs alongside AI agents. They can be assigned to terminal slots in the Agent Fleet and launched like any other CLI, and their login status is checked automatically.

## The Tools

| Tool | CLI Command | What it does |
|------|-------------|-------------|
| **GitHub CLI** | `gh` | Manage repositories, pull requests, and issues from the terminal |
| **Stripe CLI** | `stripe` | Payments, webhooks, and Stripe API testing from the terminal |
| **Supabase CLI** | `supabase` | Local Postgres stack, auth, storage, and database management |
| **Valyu CLI** | `valyu` | Web search, content extraction, and AI reasoning data access |
| **PostHog CLI** | `posthog-cli` | Analytics, SQL querying, and sourcemap management |
| **ElevenLabs CLI** | `elevenlabs` | Text-to-speech, voice cloning, and AI voice agent management |
| **Ramp CLI** | `ramp` | Expense management and programmatic corporate card issuance for AI agents |
| **Google Workspace CLI** | `gws` | Control Gmail, Drive, Docs, Calendar, and Sheets from the terminal |
| **AgentMail CLI** | `agentmail` | Email inbox management and transactional emails for AI agents |
| **Vercel CLI** | `vercel` | Fast application deployment and cloud environment management |

## Using Tool CLIs

1. **Install** the CLI you need. Each tool shows its install command under **Settings → CLI tools** if it is not detected
2. **Authenticate** by running the tool's login command in any terminal (for example `gh auth login` or `vercel login`)
3. **Assign** the tool to a terminal slot in the workspace setup Agent Fleet, or launch it from a terminal pane at any time

## Common Commands

| Tool | Common Command | Purpose |
|------|---------------|---------|
| GitHub | `gh pr create` | Open a pull request |
| GitHub | `gh repo clone <repo>` | Clone a repository |
| Stripe | `stripe listen` | Forward webhooks to your local server |
| Supabase | `supabase start` | Start the local development stack |
| Vercel | `vercel deploy` | Deploy the current project |
| PostHog | `posthog-cli sourcemap upload` | Upload source maps for error decoding |

## Checking Status

The **CLI tools** section in Settings lists every AI agent and tool CLI with its detection and authentication status, the detected version, and install commands for anything missing. Use the refresh button to re-scan after installing a new CLI.
