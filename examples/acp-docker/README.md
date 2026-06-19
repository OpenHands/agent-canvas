# Containerized ACP agent-server for Agent Canvas

Run an ACP agent (Codex / Claude Code / Gemini CLI) against a **containerized**
Agent Server and drive it from Agent Canvas, with credentials supplied through
the Canvas UI. This is the local-Docker counterpart of the cloud path — a fresh
container has no host CLI login, so credentials come from you instead.

See [`../../docs/ACP_AGENTS.md`](../../docs/ACP_AGENTS.md#running-acp-agents-in-a-docker-container)
for the full walkthrough; this is the quick start.

## 1. Bring up the agent-server

```bash
cd examples/acp-docker
docker compose up
```

This starts `ghcr.io/openhands/agent-server:latest-python` on
`http://localhost:8010` with a persistent `acp-data` volume. The image
pre-installs the ACP CLI wrappers and the SDK rewrites `npx -y <pkg>` to those
pinned binaries in-pod, so Canvas can keep sending the default `npx` command
unchanged.

For a **reproducible, pinned** image, generate `.env` from the repo's single
source of truth (`config/defaults.json`) first — it pins `AGENT_SERVER_IMAGE`
to the exact `versions.agentServer` release, so two people get the same build:

```bash
npm run example:acp-docker:env   # from the repo root; writes examples/acp-docker/.env
cd examples/acp-docker && docker compose up
```

> **Minimum version.** Canvas enforces `compatibility.minimumAgentServer` from
> `config/defaults.json`; an image below it renders "Disconnected — requires
> _N_ or newer". `latest-python` is always at or above that floor. (The deeper
> functional floor is software-agent-sdk#3510, first released in v1.25.0:
> Canvas delivers every ACP credential as a loopback `LookupSecret`, and only
> #3510 resolves it off the event loop — an older image deadlocks the first ACP
> turn with `Failed to start ACP server: timed out`. The compatibility pin sits
> at or above #3510.)

To pin a newer release or a post-#3510 main build by hand instead:

```bash
AGENT_SERVER_IMAGE=ghcr.io/openhands/agent-server:$(gh api repos/OpenHands/software-agent-sdk/commits/main --jq '.sha[0:7]')-python docker compose up
```

To bake credentials into the container instead of entering them in Canvas, copy
the env template first: `cp .env.example .env` (optional — see [§3](#3-onboard-with-credentials)).

## 2. Point Canvas at it

```bash
cd ../..                      # repo root
VITE_BACKEND_BASE_URL=http://localhost:8010 npm run dev:frontend
```

The image's CORS allows `localhost`, so the browser talks to the container
directly. (You can also add it as a backend in the Canvas backend selector with
host `http://localhost:8010`.)

## 3. Onboard with credentials

Pick the ACP provider in onboarding and fill in the **Set up credentials** step.
On a containerized backend this step is **required** (there's no host login to
fall back on):

| Provider | What to paste |
|---|---|
| **Codex** (subscription) | `CODEX_AUTH_JSON` — the full contents of `~/.codex/auth.json` |
| **Claude Code** (subscription) | `CLAUDE_CODE_OAUTH_TOKEN` — your Pro/Max OAuth token |
| **Gemini CLI** (Vertex) | `GOOGLE_APPLICATION_CREDENTIALS_JSON` (SA / ADC JSON) + `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION` + `GOOGLE_GENAI_USE_VERTEXAI=true` |

Each provider also accepts an API-key path (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` /
`GEMINI_API_KEY`). Canvas saves these to the agent-server's secret store and the
start request references them as `LookupSecret`s; the SDK resolves each value at
spawn time (off the event loop, per #3510), materialises the `*_JSON` blobs to
disk, and points the CLI's data-dir env at them automatically.

> ⚠️ **Do not set `ANTHROPIC_BASE_URL` with the Claude OAuth token.** An inherited
> LiteLLM base URL silently breaks bearer auth. Canvas never sets it for you, but
> a *saved* `ANTHROPIC_BASE_URL` secret rides along on every start request — the
> credential form warns about the pair.

> ⚠️ **Gemini Vertex ADC must be freshly logged in.** Run
> `gcloud auth application-default login` — a stale token returns `invalid_rapt`.

> ℹ️ **Baked creds in `.env` may not satisfy the onboarding gate.** The login
> probe checks CLI login state (`claude auth status` / `codex login status` /
> Gemini's OAuth credentials file), not container env vars — a container with
> only e.g. `GEMINI_API_KEY` baked via `.env` typically still probes as
> logged-out, and the credentials step then blocks "Next". Enter (or re-enter)
> a credential in the UI to proceed; the baked env var still works for the
> agent itself.

## Tear down

```bash
docker compose down           # keep the volume
docker compose down -v        # also drop credentials/conversations
```
