# agent-canvas — rbren's mod

> [!NOTE]
> **rbren's mod** is a **long-running personal fork** of [`OpenHands/agent-canvas`](https://github.com/OpenHands/agent-canvas) maintained by **Robert Brennan** (`@rbren`) at [`rbren/agent-canvas`](https://github.com/rbren/agent-canvas).
> The fork's default branch — this `main` — intentionally **diverges from upstream `main`** to carry personal preferences (theming, layout tweaks, dev-loop helpers, etc.) on top of upstream.
> It is rebased onto upstream periodically and is not guaranteed to be stable between rebases. If you are looking for the canonical project, use [`OpenHands/agent-canvas`](https://github.com/OpenHands/agent-canvas).

> [!IMPORTANT]
> **Maintainers and agents working on rbren's mod:** read
> [`.agents/skills/long-running-fork.md`](.agents/skills/long-running-fork.md)
> first. It documents the merge-friendly editing discipline, the remote
> layout (`origin` = fork, `upstream` = `OpenHands/agent-canvas`), the
> **MODLOG** (canonical inventory of every fork-local divergence from
> upstream `main`), and the **SYNCLOG** (chronological record of upstream
> syncs). The skill is also auto-loaded by OpenHands for every task on
> rbren's mod's `main`. Fork-local edits in source are tagged with a
> `rbren's mod:` comment so they can be grepped easily.

## Robert's dockerless VM install

These are the install steps Robert uses on a fresh Linux VM where Docker is not
available (or not desired) and the VM is dedicated to running Agent Canvas.

> [!WARNING]
> The dockerless path runs the agent-server directly on the host — the agent has
> full access to the VM's filesystem. Only do this on a VM you own and treat as
> disposable. See [SELF_HOSTING.md](SELF_HOSTING.md) for hardening guidance.

**Prerequisites**:

- A Linux VM you control (Ubuntu 22.04+ / Debian 12+ tested)
- Node.js **22.12.x or later** (`nvm install 22` works)
- `npm`
- [`uv`](https://docs.astral.sh/uv/) — used to launch the agent server via `uvx`
- `git`

```sh
# 1. Install uv (one-liner from astral.sh)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. Clone this fork (default branch is `main`, which is the customized one)
git clone https://github.com/rbren/agent-canvas.git
cd agent-canvas

# 3. Install JS deps and run dockerless
npm install
npm run dev:dangerously-dockerless
```

Access the UI at [http://localhost:8000](http://localhost:8000).

To expose it to the outside world, front it with nginx + Let's Encrypt + basic
auth — do **not** publish the raw port. See [SELF_HOSTING.md](SELF_HOSTING.md)
for a reference setup.

If you want the static (non-hot-reloading) variant for stability:

```sh
npm run dev:dangerously-dockerless
```

If you are hacking on the frontend itself and want live reload:

```sh
npm run dev:dangerously-dockerless:dynamic
```

---

## Upstream README

> [!WARNING]
> This project is in alpha phase. It may be vibecoded, untested, or out of date. [Learn more](https://github.com/OpenHands/incubator-program).

OpenHands is a platform for orchestrating coding agents across different environments. You can:

- ⌨️ prompt agents manually
- 🕐 run agents on a schedule
- ⚡ trigger agents automatically — e.g. from Slack, GitHub, or Datadog.

Agents can run anywhere:

- 🧑‍💻 on your laptop
- 🖥️ on a remote virtual machine
- ☁️ in our hosted cloud
- 🏢 or inside your company’s infrastructure

The same Agent Canvas frontend can swap between each of these environments, so you can see everything in one place.

OpenHands works with any agent harness (e.g. Claude Code, Codex)
or connect directly to an LLM (e.g. Anthropic, OpenAI, Gemini, Mistral, Minimax, Kimi).

If you have questions or feedback, please open a GitHub issue or join the [#proj-agent-canvas channel in Slack](https://openhands.dev/joinslack)

<img width="1509" height="826" alt="Screenshot 2026-05-11 at 10 13 19 AM" src="https://github.com/user-attachments/assets/71ef41ae-8f6d-4fbf-990f-d672175d93d1" />

## Quickstart

### Direct Install

You can install OpenHands to run agents on any machine: on your laptop, on a dedicated computer like a Mac Mini,
or on a server in the cloud.

The most powerful way to run OpenHands is on a server in the cloud. This allows your agents to continue running
even when your laptop is shut, and makes it easier to trigger your agents through third-party services
like Slack, GitHub, and Datadog. See [SELF_HOSTING.md](SELF_HOSTING.md) for details, especially with respect to security hardening.

Notably, you can run the backend in _multiple different environments_, and switch between
them from the same Agent Canvas frontend. E.g. you can share an Agent Server with your team for agents doing
code review and dependency updates, then have your personal agents running on your laptop.

> [!WARNING]
> This runs the agent-server directly on the machine you're installing on--the agent will have full access to your filesystem!

**Prerequisites**:

- Node.js 22.12.x or later
- `npm`
- `uv` (for running the agent server via `uvx`)

```sh
git clone https://github.com/OpenHands/agent-canvas.git
cd agent-canvas
npm install
npm run dev
```

Access the UI at [http://localhost:8000](http://localhost:8000). You can add additional backends directly from the UI.

# Architecture

Agent Canvas is powered by the [OpenHands Agent Server](https://github.com/OpenHands/software-agent-sdk/tree/main/openhands-agent-server/openhands/agent_server), a REST API for running multiple agents on a single machine. Each Agent Server runs on a single host/port; the Agent Canvas can connect to multiple Agent Servers and easily flip between them.

You can run an Agent Server anywhere:

- Directly on your laptop (be careful!)
- On a dedicated machine like a Mac Mini
- On a virtual machine in the cloud
- Inside OpenHands Cloud (our commercial offering)

The Agent Server is often paired with an [Automation Server](https://github.com/OpenHands/automation), which lets you set up agents that run on a schedule or in response to events.

<img width="1456" height="1258" alt="image" src="https://github.com/user-attachments/assets/cb6de6f5-ac30-4d04-a76a-b5c259f0c163" />

## More documentation

For contributor and developer workflows, including frontend-only mode, mock mode, environment variables, and build/test commands, see [DEVELOPMENT.md](./DEVELOPMENT.md).
