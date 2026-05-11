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

### With Docker (recommended)

**Prerequisites**:

- Node.js 22.12.x or later
- `npm`
- Docker

Set `$PROJECT_PATH` to the directory on your machine where your projects live (e.g. `/path/to/your/projects`). The agent server will mount this directory so the agent can read and edit your code.

By default the container is kept isolated from your host home — only `~/.openhands`, `~/.claude`, `~/.codex`, and `~/.ssh` are mounted individually (and only if they exist). If you want the **Add Workspace** dialog to browse your real host filesystem, set `OH_MOUNT_HOST_HOME=1` before `npm run dev:docker` to bind-mount your entire host home onto `/home/openhands` in the container. The Add Workspace modal also shows this hint inline when it detects the mount is off.

```sh
export PROJECT_PATH=/path/to/your/projects
git clone https://github.com/OpenHands/agent-canvas.git
cd agent-canvas
npm install
npm run dev:docker
```

Access the UI at [http://localhost:8000](http://localhost:8000)

By default, the dev script automatically passes the generated session API key to the browser frontend for local convenience. To require each browser to enter the key instead, start it with `OH_REQUIRE_BROWSER_SESSION_KEY=1 npm run dev:docker`; users will see the Agent Server connection screen and must enter the key from `~/.openhands/agent-canvas/session-api-key.txt` (or your `SESSION_API_KEY` / `OH_SESSION_API_KEYS_0` value).

### Without Docker

> [!WARNING]
> This runs the agent-server directly on the machine you're installing on--the agent will have full access to your filesystem!

Running without docker is great if you're running Agent Canvas on a VM. See [SELF_HOSTING.md](SELF_HOSTING.md) for details,
especially with respect to security hardening. Notably, you can run the backend on _multiple different VMs_ and switch between
them from the same Agent Canvas frontend!

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

Access the UI at [http://localhost:8000](http://localhost:8000)

By default, the dev script automatically passes the generated session API key to the browser frontend for local convenience. To require each browser to enter the key instead, start it with `OH_REQUIRE_BROWSER_SESSION_KEY=1 npm run dev:dangerously-dockerless`; users will see the Agent Server connection screen and must enter the key from `~/.openhands/agent-canvas/session-api-key.txt` (or your `SESSION_API_KEY` / `OH_SESSION_API_KEYS_0` value).

### Remote VM / internet access

To serve Agent Canvas from a VM, use the static remote stack:

```sh
npm run dev:remote -- --port 8000
```

Expose only the ingress port (default `8000`) through your firewall or reverse proxy. The agent-server, automation backend, and static-file server bind to `127.0.0.1`; the public ingress forwards `/api`, `/sockets`, and the UI. The frontend build intentionally does **not** bundle `VITE_SESSION_API_KEY`. When you open the UI in a browser, enter the session API key from `~/.openhands/agent-canvas/session-api-key.txt` (or your `SESSION_API_KEY` / `OH_SESSION_API_KEYS_0` value) on the Agent Server connection screen.

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
