# Getting Started with Agent Canvas

Welcome to Agent Canvas! This guide will walk you through installing Agent Canvas, connecting it to an AI model, and running your first conversation with an agent.

## What is Agent Canvas?

Agent Canvas is a web interface for managing AI agents. With it, you can:

- ⌨️ **Prompt agents manually** — Have conversations and give tasks to AI agents
- 🕐 **Run agents on a schedule** — Automate recurring tasks
- ⚡ **Trigger agents automatically** — Respond to events from Slack, GitHub, and more

Agents can run on your laptop, a remote server, or in the cloud. This guide starts with a local setup, then shows you how to connect to OpenHands Cloud.

---

## What You'll Accomplish

By the end of this guide, you will have:

1. ✅ Installed Agent Canvas on your computer
2. ✅ Connected to an LLM (AI model) provider
3. ✅ Had your first conversation with an agent
4. ✅ Learned how to work with multiple agent-server backends

---

## Prerequisites

Before you begin, make sure you have the following:

### System Requirements

| Requirement | How to Check | How to Install |
|-------------|--------------|----------------|
| **Node.js 22.12 or later** | Run `node --version` in terminal | [Download from nodejs.org](https://nodejs.org/) |
| **npm** | Run `npm --version` in terminal | Included with Node.js |
| **Docker** (recommended) | Run `docker --version` in terminal | [Download Docker Desktop](https://www.docker.com/products/docker-desktop/) |

### LLM Provider API Key

You'll need an API key to connect Agent Canvas to an AI model. Choose one of these options:

#### Option A: OpenHands Cloud (Easiest)

**Recommended for new users.** A single OpenHands API key gives you access to most major AI models (Claude, GPT-4, Gemini, and more) without needing separate accounts with each provider.

1. Go to [OpenHands Cloud API Keys](https://app.all-hands.dev/settings/api-keys)
2. Create an account or log in
3. Click **Create API Key**
4. Give it a name (e.g., "Agent Canvas") and save it
5. **Copy the key immediately** — you won't be able to see it again

> 💡 **Tip:** If you didn't save your API key, no problem! Just delete the old one and click **Create API Key** again to generate a new one.

> 📝 **Note:** OpenHands Cloud has two different API keys. For now, you only need the **LLM API key**. We'll use the other one (REST API key) later in this guide. See the [Glossary](#openhands-llm-api-key-vs-openhands-rest-api-key) if you're confused about the difference.

#### Option B: Direct Provider API Key

If you already have an API key with a provider, you can use it directly:

- **Anthropic** (Claude): [console.anthropic.com](https://console.anthropic.com/)
- **OpenAI** (GPT): [platform.openai.com](https://platform.openai.com/)
- **Google** (Gemini): [ai.google.dev](https://ai.google.dev/)
- **Mistral**: [console.mistral.ai](https://console.mistral.ai/)

---

## Installation

### Option A: With Docker (Recommended)

Docker runs the agent in an isolated container, which is safer because the agent can only access the specific folder you choose to share with it.

#### Step 1: Choose Your Project Folder

The agent needs access to a folder on your computer where your projects live. This is the folder the agent will be able to read and edit files in.

**For example:**
- On Mac: `/Users/yourname/Projects`

> 💡 **Tip:** On Mac hold down the option key and right click a folder to use the Copy as Pathname function to automatically get the correct pathname to your folder.

#### Step 2: Clone and Install

Open **Terminal** on your Mac and run these commands one at a time:

```sh
git clone https://github.com/OpenHands/agent-canvas.git
```

```sh
cd agent-canvas
```

```sh
npm install
```

#### Step 3: Start Agent Canvas

Now you'll start Agent Canvas and tell it which folder to give the agent access to.

**Copy and edit this command**, replacing `/path/to/your/projects` with your actual projects folder:

```sh
export PROJECT_PATH=/path/to/your/projects && npm run dev:docker
```

> 💡 **Tip:** The `PROJECT_PATH` is the folder the agent can access. Choose a folder that contains the projects you want the agent to help you with. The agent cannot see or modify files outside this folder.

#### Step 4: Open the UI

Once you see output indicating the server is running, open your browser and go to:

**[http://localhost:8000](http://localhost:8000)**

You should see the Agent Canvas welcome screen. Continue to [First Launch & Onboarding](#first-launch--onboarding).

---

### Option B: Without Docker

> ⚠️ **Security Warning**
> 
> This option runs the agent server directly on your machine. The agent will have **full access to your filesystem**, can execute shell commands, and reach the network.
> 
> **Only use this option if:**
> - You're running on a dedicated virtual machine (VM)
> - You're running on a dedicated machine (like a Mac Mini server)
> - You understand and accept the security implications

#### Step 1: Install uv

The dockerless setup uses `uvx` (part of the `uv` package manager) to run the agent server. Install `uv` by running:

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
```

> 📝 **Note:** `uvx` is included with `uv`. Once `uv` is installed, `uvx` will be available automatically.

#### Step 2: Clone and Install

```sh
git clone https://github.com/OpenHands/agent-canvas.git
```

```sh
cd agent-canvas
```

```sh
npm install
```

#### Step 3: Start Agent Canvas

```sh
npm run dev:dangerously-dockerless
```

#### Step 4: Open the UI

Open your browser and go to:

**[http://localhost:8000](http://localhost:8000)**

---

### Troubleshooting Installation

> This section will be expanded based on user feedback. If you encounter an issue not listed here, please [open a GitHub issue](https://github.com/OpenHands/agent-canvas/issues).

| Problem | Solution |
|---------|----------|
| `node: command not found` | Install Node.js from [nodejs.org](https://nodejs.org/) |
| Node version too old | Update Node.js to version 22.12 or later |
| `docker: command not found` | Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| Port 8000 already in use | Another application is using port 8000. Stop it or use a different port. |
| Docker not running | Open Docker Desktop and wait for it to start |

---

## First Launch & Onboarding

When you first open Agent Canvas, you'll see a welcome wizard that guides you through the initial setup. Here's what to expect at each step.

### Opening the UI

Navigate to [http://localhost:8000](http://localhost:8000) in your browser. The onboarding wizard will appear automatically.

### Step 1: Choose Your Agent

The first screen asks you to choose which AI agent framework to use.

- **OpenHands** — Currently available. This is the agent you'll use.
- **Claude Code** — Coming soon
- **Codex** — Coming soon

Select **OpenHands** and click **Next**.

### Step 2: Check Backend Connection

This screen verifies that Agent Canvas can communicate with the agent server (the "backend").

You'll see a connection status:
- ✅ **Green: Connected** — Everything is working. Click **Next**.
- ⏳ **Checking...** — Wait a moment for the connection check to complete.
- ❌ **Red: Not connected** — There's a problem. Make sure your installation completed successfully and the server is still running in your terminal.

The default settings should work for your local installation. Click **Next** once you see the green "Connected" status.

### Step 3: Set Up Your LLM

This is where you connect Agent Canvas to an AI model.

**1. Select Your Provider**

First, use the **provider dropdown** to select where your API key is from:

- If using **OpenHands Cloud**: Select **"OpenHands"** from the dropdown
- If using **Anthropic**: Select **"Anthropic"** from the dropdown  
- If using **OpenAI**: Select **"OpenAI"** from the dropdown
- And so on for other providers...

**2. Select Your Model**

After choosing a provider, select which model you want to use (e.g., Claude Opus, GPT-4o, etc.)

**3. Enter Your API Key**

Enter the API key you obtained in [Prerequisites](#llm-provider-api-key):

- If you selected **OpenHands**: Enter your OpenHands LLM API key
- If you selected a **direct provider**: Enter that provider's API key

> ⚠️ **Important:** Your API key must match the provider you selected. An Anthropic key won't work if you have OpenHands selected, and vice versa.

**Base URL** (optional)
- Leave this blank unless you're using a custom endpoint or proxy

Click **Next** to save your settings.

### Step 4: Say Hello

You're ready to start your first conversation!

The wizard provides a starting message to help you launch your first conversation quickly.

- **Ready to try it?** Click **Launch** to start the conversation and see the agent in action
- **Want to skip for now?** Click the **X** or **Skip** to exit the wizard — you can start a conversation anytime from the home screen

If you click **Launch**, the wizard will close and your first conversation will open.

---

## Your First Conversation

Congratulations! You're now chatting with an AI agent.

### The Conversation Interface

The screen is divided into two main areas:

**Left side: Chat Panel**
- Your messages and the agent's responses
- Type your messages at the bottom
- Watch the agent think and respond in real-time

**Right side: Workspace Tabs**
- **Files** — Browse and edit files the agent is working with
- **Terminal** — See commands the agent executes
- **Browser** — Watch if the agent browses the web
- **Changes** — Review code changes the agent makes
- **Planner** — See the agent's task breakdown

### Understanding Agent Actions

The agent can perform various actions, which appear in the chat:

| Icon | Action | Description |
|------|--------|-------------|
| 📁 | File operations | Reading, writing, or editing files |
| 💻 | Terminal commands | Running shell commands |
| 🌐 | Web browsing | Visiting websites to gather information |
| 📝 | Code changes | Modifying source code |

Click on any action in the chat to expand it and see the details.

### Stopping the Agent

If the agent is heading in the wrong direction or you want to clarify something:

- Click the **Stop** button to interrupt the agent
- Send a new message to redirect or clarify

---

## Connecting OpenHands Cloud as a Remote Backend

Now that you have Agent Canvas running locally, let's add OpenHands Cloud as a second backend. This demonstrates one of Agent Canvas's powerful features: the ability to switch between multiple backends.

### Why Use a Remote Backend?

- **More compute power** — Run agents on cloud infrastructure
- **Access from anywhere** — Your conversations are stored in the cloud
- **GitHub integration** — Work directly with repositories
- **No local resources** — Free up your machine

### Setting Up OpenHands Cloud Backend

#### Step 1: Get Your OpenHands REST API Key

1. Go to [OpenHands Cloud API Keys](https://app.all-hands.dev/settings/api-keys)
2. Click **Create API Key**
3. Give it a name (e.g., "Agent Canvas Backend") and save it
4. **Copy the key immediately** — you won't be able to see it again

> ⚠️ **Important:** This is a different API key than the LLM API key you created earlier! You need both:
> - **LLM API key** → for connecting to AI models (used in LLM Settings)
> - **REST API key** → for connecting to OpenHands Cloud as a backend (used here)
>
> See the [Glossary](#openhands-llm-api-key-vs-openhands-rest-api-key) for more details.

> 💡 **Tip:** If you didn't save your API key, just delete the old one and click **Create API Key** again.

#### Step 2: Add the Backend in Agent Canvas

1. Look for the **backend selector** in the top menu bar (it likely shows "Local" or your current backend name)
2. Click on it and select **Manage Backends**
3. Click **Add Backend**
4. Fill in the form:
   - **Name:** `OpenHands Cloud` (or any name you'll remember)
   - **Host:** `https://app.all-hands.dev`
   - **API Key:** Paste your REST API key
5. Click **Save**

#### Step 3: Switch Between Backends

Now you have two backends available:

1. Click the backend selector dropdown
2. You'll see both your local backend and "OpenHands Cloud"
3. Notice the colored dot next to each — it shows the connection status
4. Click on a backend to switch to it

When you switch backends:
- The conversation list changes to show that backend's conversations
- New conversations will run on the selected backend
- Your LLM settings are shared, but conversations are separate

---

## Understanding Local vs. Cloud Workspaces

How workspaces work depends on which backend you're using.

### Local Backend

When using your local backend:

| Feature | Behavior |
|---------|----------|
| **Workspace** | A folder on your computer (within your `PROJECT_PATH`) |
| **File access** | Agent directly reads/writes files on your machine |
| **Repository picker** | Shows local directories |
| **Best for** | Working on code already on your machine |

### Cloud Backend (OpenHands Cloud)

When using OpenHands Cloud:

| Feature | Behavior |
|---------|----------|
| **Workspace** | An isolated cloud environment |
| **File access** | Files exist in the cloud, not on your machine |
| **Repository picker** | Connect GitHub repos or clone from URL |
| **Best for** | Working with GitHub repos, accessing from multiple devices |

### When to Use Which

| Scenario | Recommended Backend |
|----------|---------------------|
| Editing code that's already on your laptop | Local |
| Working on a GitHub repository | Cloud |
| Need more compute power | Cloud |
| Want to access from multiple devices | Cloud |
| Developing/testing locally | Local |
| Quick edits to local files | Local |

---

## Working with Projects and Repositories

### Starting a Conversation with Project Context

You can start conversations with or without giving the agent access to a project.

#### On Local Backend

1. From the home screen, click **New Conversation**
2. Use the **workspace selector** to browse to a local directory
3. The agent will have access to all files in that directory
4. Type your task and start the conversation

#### On Cloud Backend

1. From the home screen, click **New Conversation**
2. Connect a repository:
   - **From your GitHub:** Link your GitHub account in Git Settings, then select a repo
   - **From URL:** Paste any Git repository URL to clone it
3. The agent works in an isolated cloud environment with that repository
4. Changes can be committed and pushed back to GitHub

### Starting Without a Workspace

Not every task needs file access. You can also:

- Start a conversation without selecting a project
- Useful for questions, brainstorming, or research tasks
- The "Say Hello" onboarding step works this way

---

## Managing Conversations

### Starting New Conversations

- **From home screen:** Click the **New Conversation** button
- **From sidebar:** Click the **+** button
- Choose whether to include a workspace/repository or not

### Viewing Past Conversations

- The **sidebar** shows your recent conversations
- Use **search** to find older conversations
- Click any conversation to resume it

### Conversations and Backends

Important things to know:

- Each backend maintains its **own conversation history**
- Switching backends shows that backend's conversations
- Conversations **cannot be transferred** between backends
- Your LLM settings are shared across backends

---

## Automations

Automations let you schedule tasks that run automatically like daily reports, health checks, file cleanup, and more. Each automation runs a full OpenHands conversation on a schedule you define.

> ⚠️ **Important:** Automations only run when Agent Canvas Backend is running. If you schedule an automation for 9 AM, your Docker container must be running at that time for it to execute. Plan your schedules around when you'll have Agent Canvas active.

### Viewing Automations

To see your automations:

1. Click **Automations** in the sidebar
2. You'll see a list of all your automations, grouped by active/inactive status
3. Click any automation to see its details, configuration, and run history

### Creating an Automation

Automations are created through conversation with the agent. Simply ask OpenHands to create one:

**Example: Daily summary**
```
Create an automation called "Daily Summary" that runs every weekday at 9 AM.
It should list all files modified in the last 24 hours and summarize the changes.
```

**Example: Scheduled cleanup**
```
Create an automation that runs every Sunday at midnight to find and delete 
temporary files older than 7 days, then create a summary of what was removed.
```

The agent will guide you through:
1. Naming your automation
2. Setting the schedule (e.g., "every day at 9 AM", "every Monday", "every 6 hours")
3. Choosing a timezone
4. Confirming the task description

### Managing Automations

From the Automations page, you can:

| Action | How |
|--------|-----|
| **Enable/disable** | Toggle the switch next to any automation |
| **View details** | Click on an automation to see its configuration |
| **See run history** | Check when automations ran and their results |
| **Delete** | Use the menu (⋮) on any automation card |

### What Automations Can Access

When an automation runs, it has access to:

- Your configured LLM settings
- Files in your workspace (`PROJECT_PATH`)
- The terminal (can run commands)
- Any secrets you've stored in Settings → Secrets

### Tips for Good Automation Prompts

- **Be specific**: "Check X, and if Y happens, then do Z"
- **Include error handling**: "If the check fails, create a summary of what went wrong"
- **Define outputs**: "Save the report to `reports/` with today's date in the filename"
- **Consider timing**: Schedule automations for times when you know Agent Canvas will be running

---

## Settings Overview

### Accessing Settings

Click the **gear icon** (⚙️) or **Settings** in the menu to access settings.

### Key Settings Areas

| Setting | What it does |
|---------|--------------|
| **LLM Settings** | Change AI provider, model, or API key |
| **App Settings** | General preferences and defaults |
| **Git Settings** | Connect GitHub/GitLab for repository access |
| **Secrets** | Store sensitive values (API keys, tokens) the agent can use |
| **MCP Settings** | Configure Model Context Protocol servers |
| **Skills** | Manage agent skills and extensions |

---

## Next Steps

### Learn More

- [Architecture Overview](./README.md#architecture) — How Agent Canvas works under the hood
- [Self-Hosting Guide](./SELF_HOSTING.md) — Run Agent Canvas on your own VM with security hardening
- [Development Guide](./DEVELOPMENT.md) — For contributors who want to work on Agent Canvas

### Get Help

- [GitHub Issues](https://github.com/OpenHands/agent-canvas/issues) — Report bugs or request features
- [Slack: #proj-agent-canvas](https://openhands.dev/joinslack) — Chat with the community
- [OpenHands Documentation](https://docs.openhands.dev) — Full documentation

---

## Appendix A: Supported LLM Providers

| Provider | Example Models | Notes |
|----------|----------------|-------|
| **OpenHands** | All major models | Single API key, easiest setup |
| **Anthropic** | Claude Opus, Sonnet, Haiku | Direct provider access |
| **OpenAI** | GPT-4o, GPT-4, GPT-3.5 | Direct provider access |
| **Google** | Gemini Pro, Gemini Ultra | Direct provider access |
| **Mistral** | Mistral Large, Medium, Small | Direct provider access |

---

## Appendix B: NPM Scripts & Configuration

### NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Agent Canvas with Docker **(recommended)**. Alias for `dev:docker`. |
| `npm run dev:docker` | Start Agent Canvas with Docker. Agent runs in an isolated container. |
| `npm run dev:dangerously-dockerless` | Start without Docker. Agent has full system access. Use on VMs or dedicated machines only. |
| `npm run dev:minimal` | Start without the automation service. Simpler setup, access at `localhost:3001` instead of `8000`. |
| `npm run dev:frontend` | Start frontend only. Use when you already have an agent-server running elsewhere. |
| `npm run dev:extra-backend` | Start a second local backend on port `18002`. Useful for testing multi-backend switching. |
| `npm run build` | Build Agent Canvas for production deployment. |
| `npm run start` | Serve the production build locally. Run after `npm run build`. |

### Environment Variables

You can configure Agent Canvas behavior using environment variables. Set them either:

**Option 1: Inline with the command**
```sh
export PROJECT_PATH=~/Projects && export PORT=9000 && npm run dev
```

**Option 2: In a `.env` file**

Create a file named `.env` in the `agent-canvas` folder:
```
PROJECT_PATH=/Users/yourname/Projects
PORT=9000
```

Then run normally:
```sh
npm run dev
```

### Available Variables

| Variable | Description | Default | Used With |
|----------|-------------|---------|-----------|
| `PROJECT_PATH` | Folder the agent can access | *Required* | `dev:docker` |
| `PORT` | Port for the web UI | `8000` | All `dev:*` scripts |
| `VITE_BACKEND_BASE_URL` | URL of the agent server | Current browser origin | `dev:frontend` |
| `VITE_SESSION_API_KEY` | Auth key for secured backends | — | `dev:frontend` |
| `VITE_WORKING_DIR` | Default workspace path for new conversations | `workspace/project` | All |

### Examples

**Change the port:**
```sh
export PROJECT_PATH=~/Projects && export PORT=9000 && npm run dev
```
Access at `http://localhost:9000`

**Connect frontend to a remote backend:**
```sh
export VITE_BACKEND_BASE_URL=https://my-server.example.com && export VITE_SESSION_API_KEY=my-secret-key && npm run dev:frontend
```

**Set a default working directory:**
```sh
export PROJECT_PATH=~/Projects && export VITE_WORKING_DIR=~/Projects/my-app && npm run dev
```

---

## Appendix C: Glossary

### Agent

The AI system that processes your requests and performs tasks. Agent Canvas currently supports the **OpenHands agent**, with Claude Code and Codex coming soon.

### Agent Server (Backend)

The service that actually runs agent tasks. It can run:
- **Locally** on your machine (what you set up in this guide)
- **Remotely** on OpenHands Cloud, a VM, or your company's infrastructure

Agent Canvas can connect to multiple backends and switch between them.

### Backend

Another term for Agent Server. These terms are used interchangeably in the UI.

### Workspace

The directory or environment where the agent can read and write files.
- **On local backends:** A folder on your machine (within `PROJECT_PATH`)
- **On cloud backends:** An isolated cloud environment

### Conversation

A session with the agent, including your messages, the agent's responses, and all actions taken. Conversations are stored per-backend.

### OpenHands LLM API Key vs. OpenHands REST API Key

> ⚠️ **These are two different keys used for different purposes!**

This is a common point of confusion. Both keys are created from the same page ([OpenHands Cloud API Keys](https://app.all-hands.dev/settings/api-keys)), but they serve different purposes:

| | OpenHands LLM API Key | OpenHands REST API Key |
|---|---|---|
| **Purpose** | Authenticate with AI models (Claude, GPT-4, etc.) | Authenticate with OpenHands Cloud as a backend |
| **Where to use it** | Settings → LLM Settings → API Key | Manage Backends → Add Backend → API Key |
| **What it does** | Lets you send prompts to AI models | Lets Agent Canvas communicate with OpenHands Cloud |
| **How to create** | Click **Create API Key**, name it (e.g., "Agent Canvas LLM") | Click **Create API Key**, name it (e.g., "Agent Canvas Backend") |

> 💡 **Tip:** You can create multiple API keys with descriptive names to keep track of which is which. If you lose a key, just delete it and create a new one.

**[SCREENSHOT: Show both keys on the OpenHands Cloud API Keys screen with labels]**

### Session API Key

An authentication key required by some secured Agent Server installations. This is different from LLM API keys and is used for backend authentication when self-hosting.

---

## Troubleshooting

> This section will be expanded based on user feedback. Please [open a GitHub issue](https://github.com/OpenHands/agent-canvas/issues) if you encounter problems not covered here.

### Installation Issues

*(To be added based on feedback)*

### Connection Issues

*(To be added based on feedback)*

### LLM/API Key Issues

*(To be added based on feedback)*
