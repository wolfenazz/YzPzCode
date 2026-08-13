# Building an Agent - Cline

> Source: https://docs.cline.bot/sdk/guides/building-an-agent
> Cached: 2026-08-13T09:55:20.297Z

---

## On this page

- [What It Builds](#what-it-builds)
- [Prerequisites](#prerequisites)
- [Get the Code](#get-the-code)
- [How It Works](#how-it-works)
[Defining Tools with Zod Schemas](#defining-tools-with-zod-schemas)
- [Completion Tools](#completion-tools)
- [System Prompt](#system-prompt)
- [Event Streaming](#event-streaming)
- [Post-Run Processing](#post-run-processing)

- [Run It](#run-it)
- [Extending Further](#extending-further)
- [More Examples](#more-examples)

[Guides](/sdk/guides/building-an-agent)# Building an Agent

Walk through a complete code review bot that reads diffs, analyzes code, and produces structured feedback.

This tutorial walks through the [code-review-bot example](https://github.com/cline/cline/tree/main/apps/examples/code-review-bot) from the SDK repository. By the end, you’ll understand how to combine custom tools, system prompts, completion lifecycle, and event streaming into a real application.
## [​](#what-it-builds)What It Builds

A code review agent that:

- Reads a git diff from the local repo

- Optionally reads full file contents for context

- Produces structured review comments with severity levels

- Ends the run with a summary and approve/reject decision

## [​](#prerequisites)Prerequisites

- Node.js 22+

- An Anthropic API key

- A git repository with at least one commit

## [​](#get-the-code)Get the Code

```
git clone https://github.com/cline/cline.git
cd cline/apps/examples/code-review-bot
bun install

```

Or read along with the [source on GitHub](https://github.com/cline/cline/blob/main/apps/examples/code-review-bot/src/index.ts).
## [​](#how-it-works)How It Works

### [​](#defining-tools-with-zod-schemas)Defining Tools with Zod Schemas

The bot uses `createTool` with zod schemas for type-safe tool definitions. Here’s the review comment tool:
```
createTool({
  name: "add_review_comment",
  description: "Add a review comment on a specific file and line.",
  inputSchema: z.object({
    file: z.string().describe("File path"),
    line: z.number().describe("Line number (approximate is fine)"),
    severity: z.enum(["critical", "warning", "suggestion"]),
    comment: z.string().describe("The review comment"),
  }),
  async execute(input) {
    reviews.push(input)
    return `Comment added (${reviews.length} total)`
  },
})

```

Key points:

- `z.enum` constrains severity to valid values, which improves model accuracy

- `.describe()` on each field tells the model what to provide

- The tool accumulates results in an array for post-run processing

### [​](#completion-tools)Completion Tools

The `submit_review` tool uses `lifecycle: { completesRun: true }` to signal that the agent’s work is done:
```
createTool({
  name: "submit_review",
  description: "Submit the completed review with a summary.",
  inputSchema: z.object({
    summary: z.string().describe("Brief overall assessment of the changes"),
    approve: z.boolean().describe("Whether the changes look good to merge"),
  }),
  lifecycle: { completesRun: true },
  async execute(input) {
    return JSON.stringify({ summary: input.summary, approve: input.approve })
  },
})

```

Without this, the agent would keep looping until `maxIterations`. With it, the agent calls `submit_review` when it’s done and the run ends cleanly.
### [​](#system-prompt)System Prompt

The system prompt gives the agent a structured workflow to follow:
```
const agent = new Agent({
  systemPrompt: `You are a senior code reviewer. Analyze the git diff provided and leave review comments using the add_review_comment tool. Focus on:
- Bugs and logic errors (critical)
- Security issues (critical)
- Performance problems (warning)
- Style and readability improvements (suggestion)

When you are done reviewing, call submit_review with a brief summary.`,
  // ...
})

```

Telling the agent exactly which tools to use and when keeps the workflow predictable.
### [​](#event-streaming)Event Streaming

The bot subscribes to events to show progress as the agent works:
```
agent.subscribe((event) => {
  switch (event.type) {
    case "assistant-text-delta":
      process.stdout.write(event.text ?? "")
      break
    case "tool-started":
      if (event.toolCall.toolName === "add_review_comment") {
        const input = event.toolCall.input
        console.log(`  [${input.severity}] ${input.file}:${input.line} - ${input.comment}`)
      }
      break
  }
})

```

This prints review comments as they’re made, so you see results streaming rather than waiting for the full run to finish.
### [​](#post-run-processing)Post-Run Processing

After the run, the bot groups comments by severity and prints a summary:
```
const result = await agent.run(`Review this git diff:\n\n\`\`\`diff\n${diff}\n\`\`\``)

const critical = reviews.filter((r) => r.severity === "critical")
const warnings = reviews.filter((r) => r.severity === "warning")
const suggestions = reviews.filter((r) => r.severity === "suggestion")

```

The tool calls accumulate structured data during the run, and the application processes it after. This pattern is useful any time you want the agent to produce structured output.
## [​](#run-it)Run It

```
ANTHROPIC_API_KEY=sk-ant-... bun dev        # review last commit
ANTHROPIC_API_KEY=sk-ant-... bun dev main   # review against main

```

## [​](#extending-further)Extending Further

From here, you could:

- Add a tool that posts review comments back to GitHub via the API

- Use `continue()` for follow-up questions about specific findings

- Add a `checkstyle` tool that runs linters on the changed files

- Connect it to a webhook for automatic PR reviews

## [​](#more-examples)More Examples

## CLI Agent

Interactive terminal chat with tools and multi-turn conversation.## Multi-Agent

Parallel agents streaming to a web UI.
See [Creating Custom Tools](/sdk/guides/creating-custom-tools) and [Writing Plugins](/sdk/guides/writing-plugins) for more on extending agent capabilities.Was this page helpful?

YesNo[Hub & Spoke](/sdk/architecture/hub-spoke)[Permission Handling](/sdk/guides/permission-handling)⌘I[x](https://x.com/cline)[github](https://github.com/cline/cline)[discord](https://discord.gg/cline)[Powered byThis documentation is built and hosted on Mintlify, a developer documentation platform](https://www.mintlify.com?utm_campaign=poweredBy&utm_medium=referral&utm_source=cline-efdc8260)