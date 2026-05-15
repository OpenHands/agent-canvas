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

The MVP local install path is the packaged CLI: install the npm package, then run `openhands`.

**Prerequisites**:

- Node.js 22.12.x or later
- `npm`
- Docker for the default sandboxed agent-server backend

```sh
npm install -g @openhands/agent-canvas
openhands
```

Open the UI at [http://localhost:8000](http://localhost:8000). The first launch does not require cloning this repository or choosing a workspace up front. By default, Agent Canvas starts a Docker-backed agent server, the automation backend, and a static production build of the frontend behind one local URL.

If you want the Docker agent server to access existing repositories on your machine, expose a projects folder before launching:

```sh
PROJECT_PATH=/path/to/your/projects openhands
```

`PROJECT_PATH` is optional. When it is omitted, Agent Canvas still starts with its managed internal workspace directory; set `PROJECT_PATH` only when you want `/projects` inside the container to point at a host folder. If you want the **Add Workspace** dialog to browse your real host filesystem, also set `OH_MOUNT_HOST_HOME=1`.

### Split frontend/backend mode

The same CLI can run only one side of the stack, which is useful for remote agent-server installs or custom process managers:

```sh
openhands --backend-only   # only runs the Docker agent server on localhost:18000
openhands --frontend-only  # only runs the static frontend/proxy on localhost:8000
```

To point the frontend at a different agent server:

```sh
openhands --frontend-only --backend-url http://your-server:18000
```

Use `openhands --help` for the complete option list.

### From source

Use a source checkout when you are contributing to Agent Canvas itself or need unreleased changes.

#### With Docker

```sh
git clone https://github.com/OpenHands/agent-canvas.git
cd agent-canvas
npm install
npm run dev:docker
```

This serves a static production build of the frontend behind the local ingress proxy. That is the recommended source mode for normal use, remote access, and tunnels such as ngrok because it avoids Vite hot-reload restarts and large dev-module request bursts. If you are developing the Agent Canvas frontend itself and want live reload, use `npm run dev:docker:dynamic` instead.

Windows PowerShell exception: if `npm run dev:docker` starts the backend but `localhost:8000` shows Bad Gateway, start the same stack directly with Node instead. Do not include any prompt characters or a trailing `>` in the value.

```powershell
$env:PROJECT_PATH = "/path/to/your/projects"
git clone https://github.com/OpenHands/agent-canvas.git
cd agent-canvas
npm install
node --env-file-if-exists=.env .\scripts\dev-docker.mjs
```

#### Without Docker

> [!WARNING]
> This runs the agent-server directly on the machine you're installing on--the agent will have full access to your filesystem!

Running without Docker is useful on a dedicated VM. See [SELF_HOSTING.md](SELF_HOSTING.md) for details, especially with respect to security hardening. Notably, you can run the backend on _multiple different VMs_ and switch between them from the same Agent Canvas frontend.

**Additional prerequisite**: [`uv`](https://docs.astral.sh/uv/) for running the agent server via `uvx`.

```sh
git clone https://github.com/OpenHands/agent-canvas.git
cd agent-canvas
npm install
npm run dev:dangerously-dockerless
```

Access the UI at [http://localhost:8000](http://localhost:8000).

This also serves a static production build for stability. If you are developing the Agent Canvas frontend itself and want live reload, use the dynamic dockerless command instead:

```sh
npm run dev:dangerously-dockerless:dynamic
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

## npm Package

Agent Canvas is also available as an npm package for embedding in your own applications:

> [!WARNING]
> Agent Canvas has not published a stable release yet. Until the first stable version is available, the npm `latest` dist-tag may point to alpha, beta, or release-candidate builds, so `npm install @openhands/agent-canvas` can install a prerelease. Pin an exact version if you need predictable behavior.
> This temporary behavior is tracked in [#395](https://github.com/OpenHands/agent-canvas/issues/395); retag `latest` to the first stable release when it ships.

```bash
npm install @openhands/agent-canvas
```

### Usage

Import the full package or specific components:

```typescript
// Full package
import { AgentServerUIProviders } from "@openhands/agent-canvas";

// Individual component packages
import { BrowserPanel } from "@openhands/agent-canvas/browser";
import { ChatPanel } from "@openhands/agent-canvas/conversation";
import { FileExplorer } from "@openhands/agent-canvas/files";
import { TerminalPanel } from "@openhands/agent-canvas/terminal";
```

### Available Subpath Exports

| Subpath                                | Description                                   |
| -------------------------------------- | --------------------------------------------- |
| `@openhands/agent-canvas`              | Main entry with providers and core components |
| `@openhands/agent-canvas/browser`      | Browser/preview panel components              |
| `@openhands/agent-canvas/conversation` | Chat interface and message components         |
| `@openhands/agent-canvas/files`        | File explorer and editor components           |
| `@openhands/agent-canvas/settings`     | Settings screens and forms                    |
| `@openhands/agent-canvas/sidebar`      | Sidebar navigation components                 |
| `@openhands/agent-canvas/terminal`     | Terminal emulator component                   |
| `@openhands/agent-canvas/i18n`         | Internationalization resources                |

## More documentation

For contributor and developer workflows, including frontend-only mode, mock mode, environment variables, and build/test commands, see [DEVELOPMENT.md](./DEVELOPMENT.md).
