Here is the complete guide. You can copy the content below and save it as a `.md` file (for example, `cli-master-guide.md`) to keep it handy.

***

# The Ultimate Developer CLI Guide

This guide covers the installation, setup, and core commands for 10 of the most powerful Command Line Interfaces (CLIs) built for modern workflows, AI agent environments, and infrastructure management.

---

## 1. GitHub CLI (`gh`)
**Manage repositories, Pull Requests, and issues directly from your terminal.**

### Installation
```bash
# macOS
brew install gh

# Windows
winget install --id GitHub.cli
```

### Setup
```bash
gh auth login
```

### Top Commands
* **Clone a repository:** `gh repo clone <owner>/<repo>`
* **Create a Pull Request:** `gh pr create --title "Update UI" --body "Fixed the CSS."`
* **View Issues:** `gh issue list`

---

## 2. Stripe CLI (`stripe`)
**Set up payments, trigger payment events, and test webhooks locally.**

### Installation
```bash
# macOS
brew install stripe/stripe-cli/stripe

# Windows (via Scoop)
scoop install stripe
```

### Setup
```bash
stripe login
```

### Top Commands
* **Listen for local webhooks:** `stripe listen --forward-to localhost:3000/webhook`
* **Trigger an event:** `stripe trigger payment_intent.succeeded`
* **View event logs:** `stripe logs tail`

---

## 3. Supabase CLI (`supabase`)
**Manage your database, run a full local Postgres stack, Auth, and Storage.**

### Installation
```bash
npm install -g supabase
```

### Setup
```bash
supabase login
```

### Top Commands
* **Initialize a project:** `supabase init`
* **Start local stack (requires Docker):** `supabase start`
* **Push schema changes:** `supabase db push`

---

## 4. Valyu CLI (`valyu-cli`)
**Web search, content extraction, and real-time specialized data access built for AI reasoning.**

### Installation
```bash
npm install -g valyu-cli
```

### Setup
```bash
export VALYU_API_KEY="your_api_key_here"
```

### Top Commands
* **Search web data:** `valyu search "latest AI trends" --max 5`
* **Extract page content:** `valyu contents https://example.com --summary`
* **Run deep research:** `valyu deep-research create "Quantum computing overview" --wait`

---

## 5. PostHog CLI (`posthog-cli`)
**Analytics setup, SQL querying, and sourcemap management.**

### Installation
```bash
npm install -g @posthog/cli
```

### Setup
```bash
posthog-cli login
# Or use environment variables for CI/CD
export POSTHOG_CLI_API_KEY="your_api_key"
```

### Top Commands
* **Run a SQL query:** `posthog-cli query "SELECT * FROM events LIMIT 10"`
* **Upload sourcemaps:** `posthog-cli sourcemap ./dist`

---

## 6. ElevenLabs CLI (`elevenlabs`)
**Text-to-Speech (TTS), Speech-to-Text (STT), voice cloning, and AI voice agent management.**

### Installation
```bash
npm install -g @elevenlabs/cli
```

### Setup
```bash
elevenlabs auth login
# Or set the environment variable
export ELEVENLABS_API_KEY="your_api_key"
```

### Top Commands
* **Initialize an agent project:** `elevenlabs agents init`
* **Preview config changes (Dry Run):** `elevenlabs agents push --dry-run`
* **Push agent configuration:** `elevenlabs agents push`

---

## 7. Ramp CLI (`ramp`)
**Expense management and programmatic corporate card issuance for AI agents.**

### Installation
*(Requires a Ramp Agent Card setup)*
```bash
npm install -g @ramp/cli
```

### Setup
Authenticate your agent via API key to authorize scoped transactions without exposing raw card data.

### Top Commands
* **Initialize agent card signup:** `ramp agent-card --signup`
* **Issue scoped credential:** Create tokenized cards with strictly enforced spend limits, approval workflows, and category restrictions directly from the terminal.

---

## 8. Google Workspace CLI (`gws`)
**Control Gmail, Drive, Docs, Calendar, and Sheets through a dynamically generated terminal interface.**

### Installation
```bash
npm install -g @googleworkspace/cli
```

### Setup
```bash
gws auth
```

### Top Commands
* **List emails:** `gws gmail messages list`
* **List Drive files:** `gws drive files list`
* **Create a Doc:** `gws docs documents create --title "Meeting Notes"`

---

## 9. AgentMail CLI (`agentmail-cli`)
**Email inbox management, transactional emails, and thread management built exclusively for AI agents.**

### Installation
```bash
npm install -g agentmail-cli
```

### Setup
```bash
export AGENTMAIL_API_KEY="am_us_xxx"
```

### Top Commands
* **Create a new inbox:** `agentmail inboxes create --display-name "Support Agent"`
* **List threads:** `agentmail inboxes:threads list --inbox-id inb_xxx`
* **Send an email:** ```bash
    agentmail inboxes:messages send \
      --inbox-id inb_xxx \
      --to user@example.com \
      --subject "Update" \
      --text "Your data has been processed."
    ```

---

## 10. Vercel CLI (`vercel`)
**Fast application deployment and cloud environment management.**

### Installation
```bash
npm install -g vercel
```

### Setup
```bash
vercel login
```

### Top Commands
* **Deploy your app:** `vercel`
* **Run a local development server:** `vercel dev`
* **Pull environment variables locally:** `vercel env pull .env.local`

***

[Google Workspace CLI Overview and Agent Skills](https://www.youtube.com/watch?v=ubebAvT2Nw0)
This video provides a practical breakdown of how to install the Google Workspace CLI and utilize its 100+ AI agent skills for terminal-based automation.


http://googleusercontent.com/youtube_content/0