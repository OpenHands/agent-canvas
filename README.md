# agent-canvas

> [!WARNING]
> This project is in alpha phase. It may be vibecoded, untested, or out of date. [Learn more](https://github.com/OpenHands/incubator-program).

OpenHands is a platform for managing agents across a variety of environments. You can:

- ⌨️ prompt agents manually
- 🕐 run agents on a schedule
- ⚡ trigger agents automatically — e.g. from Slack, GitHub, or Datadog.

Agents can run anywhere:

- 🧑‍💻 on your laptop
- 🖥️ on a remote virtual machine
- ☁️ in our hosted cloud
- 🏢 or inside your company’s infrastructure

You can work with any agent (e.g. Claude Code, Codex) or connect directly to an LLM (e.g. Anthropic, OpenAI, Gemini, Mistral, Minimax, Kimi).

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
npm run dev:dangerously-dockerless
```

Access the UI at [http://localhost:8000](http://localhost:8000). You can add additional backends directly from the UI.

### With Docker Sandbox

If you're running on your laptop, you likely want to sandbox OpenHands to limit the agent's access to your system.

Watch the video on how to run this on [Mac](https://www.youtube.com/watch?v=BenkkQmmFCg) or [Windows](https://www.youtube.com/watch?v=WAxf_RRIrB8).

**Prerequisites**:

- Node.js 22.12.x or later
- `npm`
- Docker

Set `$PROJECTS_PATH` to the directory on your machine where your projects live (e.g. `/path/to/your/projects`). The agent server will mount this directory so the agent can read and edit your code.

```sh
export PROJECTS_PATH=/path/to/your/projects
git clone https://github.com/OpenHands/agent-canvas.git
cd agent-canvas
npm install
npm run dev:docker
```

Access the UI at [http://localhost:8000](http://localhost:8000).

# Architecture

Agent Canvas is powered by the [OpenHands Agent Server](https://github.com/OpenHands/software-agent-sdk/tree/main/openhands-agent-server/openhands/agent_server), a REST API for running multiple agents on a single machine. Each Agent Server runs on a single host/port; the Agent Canvas can connect to multiple Agent Servers and easily flip between them.

You can run an Agent Server anywhere:

- Directly on your laptop (be careful!)
- Inside a Docker container
- On a dedicated machine like a Mac Mini
- On a virtual machine in the cloud
- Inside a Kubernetes Pod
- Inside OpenHands Cloud (our commercial offering)

The Agent Server is often paired with an [Automation Server](https://github.com/OpenHands/automation), which lets you set up agents that run on a schedule or in response to events.

<img width="1456" height="1258" alt="image" src="https://github.com/user-attachments/assets/cb6de6f5-ac30-4d04-a76a-b5c259f0c163" />

## More documentation

For contributor and developer workflows, including frontend-only mode, mock mode, environment variables, and build/test commands, see [DEVELOPMENT.md](./DEVELOPMENT.md).
