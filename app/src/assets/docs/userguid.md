# YzPzCode User Guide

## Table of Contents

1. [What is YzPzCode?](#what-is-yzpzcode)
2. [Getting Started](#getting-started)
3. [Before You Begin](#before-you-begin)
4. [How to Use YzPzCode](#how-to-use-yzpzcode)
5. [Understanding the Screens](#understanding-the-screens)
6. [Common Tasks](#common-tasks)
7. [Tips for Success](#tips-for-success)
8. [Need Help?](#need-help)

---

## What is YzPzCode?

YzPzCode is a simple app that lets you work with AI coding assistants in multiple windows at the same time.

Think of it like having several AI assistants (like Claude, Codex, or Cursor) all helping you with your coding projects, each in their own workspace.

**Why use YzPzCode?**
- Work with multiple AI assistants at once
- Each assistant gets its own terminal window
- Great for reviewing code, generating code, or debugging
- Keep different projects in separate workspaces

---

## Getting Started

### 1. Download and Install

- Download YzPzCode for your computer (macOS or Linux)
- Open the downloaded file and follow the installation prompts
- Launch the app from your Applications folder or desktop

### 2. Quick Overview

When you first open YzPzCode, you'll see a **Setup Screen**. This is where you create your first workspace.

**What is a workspace?**
A workspace is like a project folder where you can work on one coding project. You can create multiple workspaces for different projects.

---

## Before You Begin

### Install AI Tools

YzPzCode works with popular AI coding tools. You'll need to install at least one before you can use it:

| Tool | What it does | How to get it |
|------|-------------|---------------|
| **Claude** | General coding assistant | [Install Claude](https://docs.anthropic.com/claude/reference/claude-cli) |
| **Codex** | Code generator | Check your provider's website |
| **Gemini** | Google's AI assistant | [Install Gemini](https://ai.google.dev/gemini-api/docs/cli) |
| **Cursor** | AI-powered coding | [Install Cursor](https://cursor.sh/docs) |
| **Command Code** | Taste-aware AI coding agent (Node.js 22+) | [Install Command Code](https://commandcode.ai/docs) |

**Don't worry about technical details** - just visit the link and follow the simple install instructions.

### Sign In

After installing an AI tool, you'll need to sign in:
- Open your terminal or command prompt
- Type the tool's name and look for a "login" or "authenticate" option
- Follow the on-screen instructions

> **Tip:** You only need to do this once for each tool.

---

## How to Use YzPzCode

### Step 1: Create Your First Workspace

1. **Name your workspace**
   - Type a name like "my-project" or "website-work"
   - This helps you keep projects organized

2. **Choose a folder**
   - Click "Browse" to pick the folder where your project is
   - This is where your AI assistants will work

3. **Pick a layout**
   - Choose how many terminal windows you want
   - **1 Terminal**: Simple, focused work
   - **2-4 Terminals**: Good for most projects
   - **6-8 Terminals**: For complex projects

### Step 2: Add AI Assistants

1. Find the "Agent Fleet" section
2. Turn on the AI tools you want to use
3. Use the `+` and `-` buttons to set how many windows each tool gets

**Example:** If you have 4 terminals and turn on Claude (2) and Codex (1), you'll have 1 empty terminal left for regular commands.

### Step 3: Start Working

1. Click the **[ Execute ]** button
2. Wait for your workspace to load (a few seconds)
3. Start typing commands in each terminal window

---

## Understanding the Screens

### Setup Screen

This is where you create new workspaces:

| Section | What it does |
|---------|--------------|
| **Workspace Configuration** | Name your project and pick the folder |
| **Terminal Layout** | Choose how many terminal windows you want |
| **Agent Fleet** | Turn on AI tools and assign them to windows |
| **CLI Tools** | See which AI tools are installed on your computer |

### Workspace Screen

After you create a workspace, you'll see:

| Element | What it does |
|---------|--------------|
| **Tabs at top** | Switch between different workspaces |
| **Theme button** | Switch between dark and light mode |
| **Terminal grid** | Your terminal windows arranged in a grid |
| **Each terminal** | Shows which AI tool is running in it |

---

## Common Tasks

### Create a New Workspace

1. Click the **[ + ]** button at the top of the screen
2. Fill in the workspace name and folder
3. Choose your layout and AI tools
4. Click **[ Execute ]**

### Switch Between Workspaces

- Click on any tab at the top of the screen
- Each workspace is saved separately, so your work won't be lost

### Close a Workspace

- Click the **[ × ]** next to the workspace tab
- This closes the workspace and all its terminals

### Start Fresh

- Click the **[ Terminate ]** button
- This closes the current workspace and takes you back to the setup screen

---

## Tips for Success

### For Beginners

- Start with **2 terminals** and 1 AI tool
- Create a separate workspace for each project
- Use the same AI tool across all terminals at first

### For Better Performance

- Don't open too many workspaces at once
- Start with fewer terminals if the app feels slow
- Close workspaces you're not using

### For Organized Work

- Use descriptive workspace names (e.g., "website-backend", "app-frontend")
- Keep related projects in separate workspaces
- Use different AI tools for different tasks:
  - **Claude** for general coding and explaining code
  - **Codex** for generating new code
  - **Gemini** for working with images and documents

---

## Need Help?

### Common Problems

**Problem: "Tool Not Installed"**

**Solution:**
1. Check if you installed the AI tool
2. Try signing in to the tool
3. Click the refresh button in the setup screen

**Problem: Workspace won't create**

**Solution:**
1. Make sure you filled in all the fields
2. Check that the folder exists on your computer
3. Try closing and reopening the app

**Problem: Terminals are stuck on "Initializing"**

**Solution:**
1. Close the workspace
2. Try creating it again
3. Restart the app if it keeps happening

**Problem: AI commands don't work**

**Solution:**
1. Make sure you're signed in to the AI tool
2. Check your internet connection
3. Try the tool's own documentation for help

---

## Platform-Specific Tips

### macOS Users

**Opening the App:**
- If macOS says the app is "damaged", right-click the app and select "Open"
- You might need to allow the app in System Preferences > Security & Privacy

**Best Performance:**
- Close other apps when using many terminals
- Use the latest version of macOS (10.15 or newer)

### Linux Users

**Best Performance:**
- Close other resource-intensive apps
- Use a lighter desktop environment if the app feels slow
- Make sure your system is up to date

---

## What Do All Those Buttons Do?

### Setup Screen Buttons

| Button | What it does |
|--------|--------------|
| **[ Execute ]** | Creates your workspace and starts working |
| **[ Browse ]** | Opens a folder picker to choose your project folder |
| **Refresh icon** (↻) | Checks for newly installed AI tools |
| **Toggle switches** | Turn AI tools on or off |

### Workspace Screen Buttons

| Button | What it does |
|--------|--------------|
| **[ + ]** | Creates a new workspace |
| **[ × ]** (on tabs) | Closes that workspace |
| **[ Terminate ]** | Closes current workspace and goes back to setup |
| **Theme button** (☀️/🌙) | Switches between light and dark mode |

---

## Frequently Asked Questions

**Q: Do I need to know how to code?**
A: Yes, YzPzCode is designed for people who write code or are learning to code.

**Q: Can I use multiple AI tools at once?**
A: Yes! You can mix different AI tools in the same workspace.

**Q: Will my code be saved?**
A: Yes, your code is saved in the project folder you selected. YzPzCode just helps you work on it.

**Q: Is my data private?**
A: Your code stays on your computer. However, when you use AI tools, they process your code according to their own privacy policies. Check each AI tool's privacy policy for details.

**Q: Can I use this without internet?**
A: No, AI tools need an internet connection to work.

**Q: How many workspaces can I have?**
A: As many as you want! Just keep in mind that each workspace uses computer resources.

**Q: Can I customize the terminal size?**
A: The terminal size is determined by the layout you choose. Pick a layout with more terminals for smaller windows, or fewer terminals for larger ones.

---

## Getting More Help

If you're still having trouble:

1. **Check the error message** - Read what the screen says carefully
2. **Try the simple fixes** - Close and reopen the app, or restart your computer
3. **Visit the AI tool's website** - Each AI tool (Claude, Codex, etc.) has its own help documentation
4. **Report the issue** - Use the app's feedback feature to let us know what's wrong

---

## You're All Set!

Now you know how to:

✅ Install and use AI coding tools
✅ Create workspaces for your projects
✅ Work with multiple AI assistants at once
✅ Switch between different projects
✅ Troubleshoot common problems

**Happy coding with your AI assistants! 🚀**
