# agent-canvas

> [!WARNING]
> This project is in an early incubator phase. It may be vibecoded, untested, or out of date. OpenHands takes no responsibility for the code or its support. [Learn more](https://github.com/OpenHands/incubator-program).

## Quickstart

This repository is a near-direct port of the OpenHands frontend adapted to talk directly to `software-agent-sdk` / `agent_server` without the usual OpenHands app backend.

### Prerequisites

- Node.js 22.12.x or later
- `npm`
- `uv` (for running the agent server via `uvx`)

### 1. Clone and install the frontend

```sh
git clone https://github.com/OpenHands/agent-canvas.git
cd agent-canvas
npm install
```

### 2. Install uv

If you do not already have `uv` installed, install it first (OpenHands SDK recommends `uv` 0.8.13+):

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Need Windows or another install method? See the official uv installation guide: <https://docs.astral.sh/uv/getting-started/installation/>

If `~/.local/bin` is not already on your `PATH`, add it:

```sh
export PATH="$HOME/.local/bin:$PATH"
command -v uvx
```

The `npm run dev` command uses `uvx` to automatically download and run the agent server, so no separate installation step is needed.

### 3. Optional: create a `.env` file

If you need to change the backend URL, frontend port, session API key, or working directory, copy the sample file:

```sh
cp .env.sample .env
```

Then edit the values you need.

### 4. Start the app

```sh
npm run dev
```

This starts the full stack:
- Agent server (via uvx)
- Automation backend (via uvx)
- Vite dev server
- Ingress proxy (routes traffic to all backends)

Access the UI at [http://localhost:8000](http://localhost:8000)

#### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Ingress port | `8000` |
| `OH_AUTOMATION_GIT_REF` | Git ref for automation backend | `main` |
| `OH_AGENT_SERVER_GIT_REF` | Git ref for agent-server | `main` |

### 5. First-run sanity check

After the page opens:

- `/` should load without errors
- `/settings` should load
- configure a working LLM model + API key under `Settings > LLM` before running the first live task
- you should be able to open or create a conversation
- `/api/automation/docs` should show the automation API docs

### Alternative: Minimal Mode (without Automation)

To run without the automation service:

```sh
npm run dev:minimal
```

This runs only agent-server + Vite (no automation backend or ingress).
Access at `http://localhost:3001/`

## More documentation

For contributor and developer workflows, including frontend-only mode, mock mode, environment variables, and build/test commands, see [DEVELOPMENT.md](./DEVELOPMENT.md).
