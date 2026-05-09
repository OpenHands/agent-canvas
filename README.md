# agent-canvas

> [!WARNING]
> This project is in sandbox phase. It may be vibecoded, untested, or out of date. OpenHands takes no responsibility for the code or its support. [Learn more](https://github.com/OpenHands/incubator-program).

Agent Canvas is a web frontend for managing agents. You can:

- ⌨️ prompt them manually
- 🕐 run them on a schedule
- ⚡ trigger them automatically—e.g. from Slack or GitHub.

Agents can run anywhere:

- 🧑‍💻 on your laptop
- 🖥️ on a remote virtual machine
- ☁️ in our hosted cloud
- 🏢 or inside your company’s infrastructure

You can work with any agent (e.g. Claude Code, Codex) or connect directly to an LLM (e.g. Anthropic, OpenAI, Gemini, Mistral, Minimax, Kimi).

If you have questions or feedback, please open a GitHub issue or join the [#proj-agent-canvas channel in Slack](https://openhands.dev/joinslack)

## Quickstart

**Prerequisites**:
- Node.js 22.12.x or later
- `npm`
- Docker

Set `$PROJECT_PATH` to the directory on your machine where your projects live (e.g. `/path/to/your/projects`). The agent server will mount this directory so the agent can read and edit your code.

```sh
export PROJECT_PATH=/path/to/your/projects
git clone https://github.com/OpenHands/agent-canvas.git
cd agent-canvas
npm install
npm run dev:docker
```

Access the UI at [http://localhost:8000](http://localhost:8000)

### Running the agent server directly (advanced)

> [!WARNING]
> This runs the agent-server directly on the machine you're installing on--the agent will have full access to your filesystem!

If you'd rather run the agent server outside of Docker, you'll also need `uv` (for running the agent server via `uvx`), and can start the dev server with:

```sh
npm run dev
```

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
