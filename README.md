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

<img width="1509" height="826" alt="Screenshot 2026-05-11 at 10 13 19 AM" src="https://github.com/user-attachments/assets/71ef41ae-8f6d-4fbf-990f-d672175d93d1" />

## Quickstart

### With Docker (recommended)

This starts the full local stack:

- Agent Canvas UI on [http://localhost:8000](http://localhost:8000)
- OpenHands Agent Server in Docker
- Automation backend
- Ingress proxy that routes everything through port `8000`

**Prerequisites**:

- [Node.js](https://nodejs.org/) 22.12.x or later
- `npm` (included with Node.js)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine, running before you start Agent Canvas
- [`uv` / `uvx`](https://docs.astral.sh/uv/getting-started/installation/) for the automation backend

Install `uv` if you do not already have `uvx`:

```powershell
# Windows PowerShell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

```sh
# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

After installing `uv`, restart your terminal if `uvx --version` is not found.

Set `PROJECT_PATH` to the folder that contains the projects you want agents to work on. The Docker container mounts this directory at `/projects`, and the UI lists its immediate subfolders as workspaces.

> [!TIP]
> If your code lives in `C:\Users\you\Documents\GitHub\agent-canvas`, set `PROJECT_PATH` to `C:\Users\you\Documents\GitHub` — the parent folder, not the `agent-canvas` folder itself.

#### Windows PowerShell

```powershell
cd C:\Users\you\Documents\GitHub
git clone https://github.com/OpenHands/agent-canvas.git
cd agent-canvas
npm install

$env:PROJECT_PATH = "C:\Users\you\Documents\GitHub"
node --env-file-if-exists=.env .\scripts\dev-docker.mjs
```

Then open [http://localhost:8000](http://localhost:8000).

> [!NOTE]
> On Windows, starting the Docker stack through `node --env-file-if-exists=.env .\scripts\dev-docker.mjs` avoids a known `npm run dev:docker` path quoting issue where Vite can exit with `'C:\Program' is not recognized...`, causing `localhost:8000` to show Bad Gateway.

#### macOS / Linux

```sh
cd ~/code
git clone https://github.com/OpenHands/agent-canvas.git
cd agent-canvas
npm install

export PROJECT_PATH="$HOME/code"
npm run dev:docker
```

Then open [http://localhost:8000](http://localhost:8000).

If you already cloned the repository, do not clone it again; just `cd` into the existing `agent-canvas` directory and run the install/start commands.

By default the container is kept isolated from your host home — only `~/.openhands`, `~/.claude`, `~/.codex`, and `~/.ssh` are mounted individually (and only if they exist). If you want the **Add Workspace** dialog to browse your real host filesystem, set `OH_MOUNT_HOST_HOME=1` before starting the Docker stack to bind-mount your entire host home onto `/home/openhands` in the container. The Add Workspace modal also shows this hint inline when it detects the mount is off.

#### Troubleshooting: Bad Gateway on localhost:8000

`localhost:8000` is the ingress proxy. If it shows Bad Gateway, one of the services behind it usually failed to start.

Check the terminal logs for lines like:

```text
[vite] Exited with code 1
[ingress] Proxy error for /:
```

If Vite exited on Windows with a `C:\Program` error, stop the stack with `Ctrl+C` and restart it with the Windows PowerShell command above:

```powershell
node --env-file-if-exists=.env .\scripts\dev-docker.mjs
```

You can also check whether the backend and frontend ports are listening:

```powershell
# Windows PowerShell
Test-NetConnection localhost -Port 18000
Test-NetConnection localhost -Port 3001
```

```sh
# macOS / Linux
curl http://localhost:18000/server_info
curl http://localhost:3001
```

If port `18000` works but port `3001` does not, the Docker agent server is healthy and the issue is the frontend/Vite process.

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

#### Windows PowerShell

```powershell
cd C:\Users\you\Documents\GitHub
git clone https://github.com/OpenHands/agent-canvas.git
cd agent-canvas
npm install
node --env-file-if-exists=.env .\scripts\dev-with-automation.mjs
```

#### macOS / Linux

```sh
git clone https://github.com/OpenHands/agent-canvas.git
cd agent-canvas
npm install
npm run dev:dangerously-dockerless
```

Access the UI at [http://localhost:8000](http://localhost:8000)

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
