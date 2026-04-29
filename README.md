# agent-server-gui

> [!WARNING]
> This project is in the **Sandbox** phase. It may be vibecoded, untested, or out of date. OpenHands takes no responsibility for the code or its support. [Learn more](https://github.com/OpenHands/incubator-program).

[![Project Status: Sandbox](https://img.shields.io/badge/status-sandbox-yellow)](https://github.com/OpenHands/incubator-program)

## Quickstart

This repository is a near-direct port of the OpenHands frontend adapted to talk directly to `software-agent-sdk` / `agent_server` without the usual OpenHands app backend.

### Prerequisites

- Node.js 22.12.x or later
- `npm`
- OpenHands Agent Server (`agent-server`) installed and available on your `PATH`

### 1. Clone and install the frontend

```sh
git clone https://github.com/OpenHands/agent-server-gui.git
cd agent-server-gui
npm install
```

### 2. Install OpenHands Agent Server

If you do not already have the backend installed, install `uv` first (OpenHands SDK recommends `uv` 0.8.13+):

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Need Windows or another install method? See the official uv installation guide: <https://docs.astral.sh/uv/getting-started/installation/>

Then install or upgrade the agent server package together with the tool/workspace dependencies it needs:

```sh
uv tool install -U \
  --with openhands-tools \
  --with openhands-workspace \
  openhands-agent-server
```

`uv tool install` exposes the server as the `agent-server` CLI. If `~/.local/bin` is not already on your `PATH`, add it before continuing:

```sh
export PATH="$HOME/.local/bin:$PATH"
command -v agent-server
```

If you prefer installing from source or want the full SDK setup flow, see the OpenHands SDK docs: <https://docs.openhands.dev/sdk/getting-started>

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

This starts an isolated local `agent-server` for this checkout and the frontend on [http://localhost:3001](http://localhost:3001).

### 5. First-run sanity check

After the page opens:

- `/` should load without errors
- `/settings` should load
- configure a working LLM model + API key under `Settings > LLM` before running the first live task
- you should be able to open or create a conversation

## More documentation

For contributor and developer workflows, including OpenHands Cloud sandbox debugging, frontend-only mode, mock mode, environment variables, and build/test commands, see [DEVELOPMENT.md](./DEVELOPMENT.md).
