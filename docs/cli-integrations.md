# Additional terminal CLIs

YzPzCode detects these commands on `PATH`, shows their version when available, and launches them in a workspace PTY. The Install action runs the vendor's documented installer in a separate terminal. Sign-in and API key setup remain in each CLI's own interface. No CLI is installed as part of the YzPzCode build.

| Agent | Detected and launched command | Windows install | macOS / Linux install | Source |
| --- | --- | --- | --- | --- |
| Devin for Terminal | `devin` | `irm https://static.devin.ai/cli/setup.ps1 \| iex` | `curl -fsSL https://cli.devin.ai/install.sh \| bash` | [Devin docs](https://docs.devin.ai/cli) |
| Trae CLI | `traecli` | `irm https://trae.cn/trae-cli/install_v2.ps1 \| iex` | `sh -c "$(curl -fsSL https://trae.cn/trae-cli/install_v2.sh)"` | [Trae docs](https://docs.trae.cn/cli_get-started-with-trae-code-cli-2) |
| Kimi Code CLI | `kimi` | `irm https://code.kimi.com/kimi-code/install.ps1 \| iex` | `curl -fsSL https://code.kimi.com/kimi-code/install.sh \| bash` | [Kimi Code docs](https://moonshotai.github.io/kimi-code/en/guides/getting-started) |
| Qoder CLI | `qoder` | `irm https://qoder.com/install.ps1 \| iex` | `curl -fsSL https://qoder.com/install \| bash` | [Qoder docs](https://docs.qoder.com/cli/installation) |
| GitHub Copilot CLI | `copilot` | `npm install -g @github/copilot` | same | [GitHub docs](https://docs.github.com/en/copilot/get-started/cli-quickstart) |
| Kiro CLI | `kiro-cli` | `irm https://cli.kiro.dev/install.ps1 \| iex` | `curl -fsSL https://cli.kiro.dev/install \| bash` | [Kiro docs](https://kiro.dev/docs/cli/) |
| Mistral Vibe | `vibe` | `uv tool install mistral-vibe` | `curl -LsSf https://mistral.ai/vibe/install.sh \| bash` | [Mistral repository](https://github.com/mistralai/mistral-vibe) |
| DeepSeek TUI | `deepseek` | `npm install -g deepseek-tui` | same | [DeepSeek TUI install](https://github.com/Hmbown/DeepSeek-TUI/blob/main/docs/INSTALL.md) |
| Aider | `aider` | `irm https://aider.chat/install.ps1 \| iex` | `curl -LsSf https://aider.chat/install.sh \| sh` | [Aider docs](https://aider.chat/docs/install.html) |
| Antigravity CLI | `agy` | `irm https://antigravity.google/cli/install.ps1 \| iex` | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` | [Google docs](https://antigravity.google/docs/getting-started?tab=cli) |
| DeepSeek Reasonix | `reasonix` | `npm install -g reasonix` | same | [Reasonix repository](https://github.com/esengine/DeepSeek-Reasonix) |
| Amp | `amp` | WSL only; Install opens [Amp docs](https://ampcode.com/docs/cli) | `curl -fsSL https://ampcode.com/install.sh \| bash` | [Amp docs](https://ampcode.com/docs/cli) |
| DeepSeek Harness | `dsh` | `npm install -g @deepseek-ai/dsh` | same | [DeepSeek repository](https://github.com/deepseek-ai/deepseek-harness) |
| CodeBuddy Code | `codebuddy` | `npm install -g @tencent-ai/codebuddy-code` | same | [Tencent docs](https://www.codebuddy.cn/docs/cli/installation) |
| MiMo Code | `mimo` | `npm install -g @mimo-ai/cli` | `curl -fsSL https://mimo.xiaomi.com/install \| bash` | [Xiaomi docs](https://mimo.mi.com/docs/en-US/tokenplan/integration/mimo-code) |
| AtomCode CLI | `atomcode` | `npm install -g @atomgit.com/atomcode` | same | [AtomCode docs](https://atomcode.atomgit.com/docs/en/getting-started.html) |

Notes:

- Qoder's npm package is `@qoder-ai/qodercli`, but the executable in current docs is `qoder`, not `qodercli`.
- Mistral's interactive command is `vibe`; `vibe-acp` is its Agent Client Protocol server.
- The older Python `kimi-cli` is archived. Kimi Code CLI retains the `kimi` executable and has a newer native installer. Kimi requires Git Bash on Windows.
- DeepSeek TUI and Reasonix are independent community projects using DeepSeek models. DeepSeek Harness is the DeepSeek AI project and starts its local Web UI with `dsh web --no-open` in a YzPzCode terminal.
- Amp documents Windows support through WSL. A native Windows YzPzCode session cannot detect a command installed only inside WSL, so its Install action opens Amp's setup instructions.
- Site favicons and source organization avatars used for the 16 entries are stored in `app/public/assets/`. Vite copies them into `app/dist/assets/` on build.
