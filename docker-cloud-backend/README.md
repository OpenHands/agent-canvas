# Docker Cloud Backend

A standalone Python service that lets **Agent Canvas** connect to it as
if it were an **OpenHands Cloud backend**, while provisioning a fresh
[`ghcr.io/openhands/agent-server:main-python`](https://github.com/orgs/OpenHands/packages/container/package/agent-server)
Docker container for every conversation.

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│    Agent Canvas frontend (localhost:3001)                       │
│         │                                                       │
│         │  REST (via /api/cloud-proxy on local agent-server)    │
│         ▼                                                       │
│  Local agent-server (localhost:18000)                           │
│         │  forwards  → Docker Cloud Backend (localhost:7999)    │
│         │                       │                              │
│         │                       │  docker run / stop / start   │
│         │                       ▼                              │
│         │          Container-1 (localhost:XXXXX) ─ conversation-A │
│         │          Container-2 (localhost:YYYYY) ─ conversation-B │
│         │                                                       │
│         │  WebSocket (direct from browser)                      │
│         └──────────────────────────── ws://localhost:XXXXX/... │
└─────────────────────────────────────────────────────────────────┘
```

Each container runs the full OpenHands agent-server stack on a
randomly-assigned host port. REST API calls from the frontend travel
through the local agent-server's cloud-proxy, while WebSocket
event streams connect directly from the browser to the container.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.11+ | Tested with 3.11–3.13 |
| Docker Engine | `docker info` must succeed without sudo — see below |
| Agent Canvas dev stack | Running normally (`npm run dev`) |

### Give your user access to Docker

```bash
sudo usermod -aG docker $USER   # then log out/in (or newgrp docker)
```

Or run the service as root / with `sudo`.

---

## Quick start

```bash
cd docker-cloud-backend

# Install dependencies (once)
pip install -r requirements.txt

# Set your LLM credentials
export LLM_MODEL=gpt-4o-mini          # any LiteLLM model string
export LLM_API_KEY=sk-...             # your API key

# Start the service (default port 7999)
python server.py
```

Then configure Agent Canvas to use it as a "Cloud" backend:

1. Open **Settings → Agent Server** in Agent Canvas (or the backend selector).
2. Click **+ Add Backend** → set Kind to **Cloud**.
3. Fill in:
   - **Host**: `http://localhost:7999`
   - **API Key**: any non-empty value (e.g. `docker-cloud-dev`)
4. Save.  Agent Canvas will connect and list your new backend.
5. Start a conversation — a Docker container will spin up automatically.

---

## Configuration

All options are set via environment variables.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `7999` | Port the service listens on |
| `LLM_MODEL` | `""` | LLM model (e.g. `gpt-4o`, `anthropic/claude-3-5-sonnet-20241022`) |
| `LLM_API_KEY` | `""` | LLM API key |
| `LLM_BASE_URL` | `""` | LLM base URL (for custom endpoints / LiteLLM proxy) |
| `AGENT_SERVER_IMAGE` | `ghcr.io/openhands/agent-server:main-python` | Docker image to use per conversation |
| `CONTAINER_AGENT_SERVER_PORT` | `8000` | Port the agent-server listens on inside the container |
| `CONTAINER_READY_TIMEOUT` | `120` | Seconds to wait for each container to become healthy |
| `DOCKER_CLOUD_API_KEY` | `""` | If set, reject requests with a different Bearer token |
| `STOP_CONTAINERS_ON_SHUTDOWN` | `false` | Set to `true` to remove all containers on service exit |

### LLM settings from the UI

You can also set LLM credentials directly in Agent Canvas after adding the
backend: go to **Settings → LLM Settings** (while the cloud backend is
selected).  The service stores the values in memory and injects them into
every new container.

---

## How it works

### Creating a conversation

1. Agent Canvas calls `POST /api/v1/app-conversations` (routed through
   the local agent-server's `/api/cloud-proxy`).
2. The service returns a **start task** with `status: WORKING`.
3. A background coroutine:
   a. Finds a free host port.
   b. Starts `docker run … -p {free_port}:8000 …`, injecting LLM env vars
      and a fresh session API key.
   c. Polls `http://localhost:{port}/server_info` until `200 OK`.
   d. Calls `POST /api/conversations` on the container with the same
      `conversation_id` so proxy paths stay consistent.
   e. Marks the task `READY` with `agent_server_url` and
      `conversation_url = http://localhost:{port}/api/conversations/{id}`.
4. Agent Canvas polls `GET /api/v1/app-conversations/start-tasks?ids=…`
   until `READY`, then navigates to the conversation page.
5. The conversation page connects its **WebSocket directly to the container**
   (`ws://localhost:{port}/sockets/events/{id}`).  REST calls go through
   the cloud proxy.

### Pausing / resuming

`POST /api/v1/sandboxes/{id}/pause` → `docker stop`

`POST /api/v1/sandboxes/{id}/resume` → `docker start` + health check

### Deleting

`DELETE /api/v1/app-conversations/{id}` → `docker stop + docker rm`

---

## API reference

The service implements the subset of the OpenHands Cloud API that Agent
Canvas needs:

```
GET  /api/keys/current
GET  /api/organizations
GET  /api/organizations/{org_id}/me

POST   /api/v1/app-conversations
GET    /api/v1/app-conversations          (?ids=…)
GET    /api/v1/app-conversations/search
GET    /api/v1/app-conversations/start-tasks  (?ids=…)
DELETE /api/v1/app-conversations/{id}
PATCH  /api/v1/app-conversations/{id}

GET  /api/v1/sandboxes                    (?id=…)
POST /api/v1/sandboxes/{id}/pause
POST /api/v1/sandboxes/{id}/resume

GET  /api/v1/settings
POST /api/v1/settings
GET  /api/v1/settings/agent-schema
GET  /api/v1/settings/conversation-schema

GET    /api/v1/secrets/search
POST   /api/v1/secrets
PUT    /api/v1/secrets/{name}
DELETE /api/v1/secrets/{name}

GET  /health
```

Interactive docs: `http://localhost:7999/docs`

---

## Notes

- **State is in-memory.** Restarting the service loses conversation
  metadata but leaves containers running. You can clean them up with
  `docker rm -f $(docker ps -aq -f label=openhands.managed=true)`.

- **Single-machine only.** Containers are exposed on `localhost`, so both
  the browser and the local agent-server must be on the same machine.

- **No authentication by default.** Set `DOCKER_CLOUD_API_KEY` if you
  want to validate the Bearer token Agent Canvas sends.

- **Container logs:** `docker logs openhands-conv-{first-8-chars-of-id}`
