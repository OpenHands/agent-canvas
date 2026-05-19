#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# agent-canvas all-in-one entrypoint
#
# Starts three services:
#   1. Agent Server   on port $AGENT_SERVER_PORT  (default 18000)
#   2. Automation     on port $AUTOMATION_PORT     (default 18001)
#   3. Static server  on port $PORT               (default 8000)
#      Routes /api/automation/* → automation, /api/* → agent-server,
#      and serves the frontend static build for everything else.
#
# Environment variables:
#   PORT                 – Unified entry point port (default: 8000)
#   AGENT_SERVER_PORT    – Internal agent-server port (default: 18000)
#   AUTOMATION_PORT      – Internal automation port (default: 18001)
#   OH_SECRET_KEY        – Secret key for settings encryption
#   OPENHANDS_AUTOMATION_API_KEY – API key for automation backend auth
#   Any agent-server or automation env vars are passed through.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

PORT="${PORT:-8000}"
AGENT_SERVER_PORT="${AGENT_SERVER_PORT:-18000}"
AUTOMATION_PORT="${AUTOMATION_PORT:-18001}"

log() { printf '[agent-canvas] %s\n' "$*"; }
log_error() { printf '[agent-canvas] ERROR: %s\n' "$*" >&2; }

# ── Default env vars (mirrors dev-docker.mjs / dev-safe.mjs) ────────────────
# OH_SECRET_KEY is required for settings/secrets encryption. Without it the
# agent-server refuses to return encrypted secrets → conversation creation
# fails with a 503. The dev launchers always set a static default.
export OH_SECRET_KEY="${OH_SECRET_KEY:-openhands-dev-secret-key-change-in-prod}"

# Persistence paths — keep settings, conversations, bash history under a
# single well-known directory that the VOLUME directive exposes.
OPENHANDS_DIR="${HOME}/.openhands"
export OH_PERSISTENCE_DIR="${OH_PERSISTENCE_DIR:-${OPENHANDS_DIR}}"
export OH_CONVERSATIONS_PATH="${OH_CONVERSATIONS_PATH:-${OPENHANDS_DIR}/agent-canvas/conversations}"
export OH_BASH_EVENTS_DIR="${OH_BASH_EVENTS_DIR:-${OPENHANDS_DIR}/agent-canvas/bash_events}"

# Track child PIDs so we can clean up on exit.
PIDS=()

cleanup() {
  log "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT SIGINT SIGTERM

# ── 1. Start Agent Server ────────────────────────────────────────────────────
log "Starting agent-server on port $AGENT_SERVER_PORT..."

if command -v openhands-agent-server >/dev/null 2>&1; then
  # Binary build (production image)
  openhands-agent-server --port "$AGENT_SERVER_PORT" &
elif [ -x /agent-server/.venv/bin/python ]; then
  # Source build (development image)
  /agent-server/.venv/bin/python -m openhands.agent_server --port "$AGENT_SERVER_PORT" &
else
  log_error "Cannot find agent-server binary or source venv."
  exit 1
fi
PIDS+=($!)

# ── 2. Start Automation Server ───────────────────────────────────────────────
log "Starting automation server on port $AUTOMATION_PORT..."

# Disable the automation's own frontend — agent-canvas provides the UI.
export AUTOMATION_FRONTEND_DIR=""

# Default to SQLite so the automation server works out of the box without
# an external PostgreSQL instance. Users can override AUTOMATION_DB_URL to
# point at a real Postgres for production deployments.
if [ -z "${AUTOMATION_DB_URL:-}" ]; then
  AUTOMATION_DB_DIR="${HOME}/.openhands/automation"
  mkdir -p "$AUTOMATION_DB_DIR"
  export AUTOMATION_DB_URL="sqlite+aiosqlite:///${AUTOMATION_DB_DIR}/automations.db"
  log "Using SQLite database: $AUTOMATION_DB_URL"
fi

# The automation server uses uvicorn. Set AUTOMATION_PORT via its CLI.
if command -v uvicorn >/dev/null 2>&1; then
  uvicorn openhands.automation.app:app \
    --host 0.0.0.0 \
    --port "$AUTOMATION_PORT" &
elif python -c "import openhands.automation" 2>/dev/null; then
  python -m uvicorn openhands.automation.app:app \
    --host 0.0.0.0 \
    --port "$AUTOMATION_PORT" &
else
  log "WARNING: Automation server not found, skipping."
fi
PIDS+=($!)

# ── 3. Wait for backends to be ready ─────────────────────────────────────────
wait_for_port() {
  local port=$1 name=$2 max_wait=${3:-30}
  local elapsed=0
  while ! (echo >/dev/tcp/127.0.0.1/"$port") 2>/dev/null; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$max_wait" ]; then
      log "WARNING: $name on port $port did not become ready within ${max_wait}s"
      return 1
    fi
  done
  log "$name is ready on port $port"
}

wait_for_port "$AGENT_SERVER_PORT" "Agent Server" 60 &
WAIT_PID1=$!
wait_for_port "$AUTOMATION_PORT" "Automation Server" 60 &
WAIT_PID2=$!
wait "$WAIT_PID1" "$WAIT_PID2"

# ── 4. Start static server (frontend + proxy) ────────────────────────────────
log "Starting frontend + proxy on port $PORT..."

node /opt/agent-canvas/static-server.mjs \
  --port "$PORT" \
  --host 0.0.0.0 \
  --dir /opt/agent-canvas/frontend \
  --route "/api/automation=http://127.0.0.1:${AUTOMATION_PORT}" \
  --route "/api=http://127.0.0.1:${AGENT_SERVER_PORT}" \
  --route "/server_info=http://127.0.0.1:${AGENT_SERVER_PORT}" \
  --route "/sockets=http://127.0.0.1:${AGENT_SERVER_PORT}" \
  --route "/alive=http://127.0.0.1:${AGENT_SERVER_PORT}" \
  --route "/health=http://127.0.0.1:${AGENT_SERVER_PORT}" \
  --route "/ready=http://127.0.0.1:${AGENT_SERVER_PORT}" \
  --route "/docs=http://127.0.0.1:${AGENT_SERVER_PORT}" \
  --route "/redoc=http://127.0.0.1:${AGENT_SERVER_PORT}" \
  --route "/openapi.json=http://127.0.0.1:${AGENT_SERVER_PORT}" &
PIDS+=($!)

log "All services started. Unified entry point: http://0.0.0.0:${PORT}/"

# Wait for any child to exit. If one dies, the trap will clean up the rest.
wait -n "${PIDS[@]}" 2>/dev/null
EXIT_CODE=$?
log_error "A service exited with code $EXIT_CODE"
exit "$EXIT_CODE"
