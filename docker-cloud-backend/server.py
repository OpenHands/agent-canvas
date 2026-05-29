"""
Docker Cloud Backend
====================
A standalone service that emulates the OpenHands Cloud API expected by
Agent Canvas, but provisions isolated Docker containers for each
conversation instead of managed cloud sandboxes.

Cloud API endpoints implemented
--------------------------------
Auth / Identity
  GET  /api/keys/current
  GET  /api/organizations
  GET  /api/organizations/{org_id}/me

Conversations
  POST   /api/v1/app-conversations
  GET    /api/v1/app-conversations                  (batch by ?ids=)
  GET    /api/v1/app-conversations/search
  GET    /api/v1/app-conversations/start-tasks      (poll by ?ids=)
  DELETE /api/v1/app-conversations/{id}
  PATCH  /api/v1/app-conversations/{id}

Sandboxes
  GET  /api/v1/sandboxes   (batch by ?id=)
  POST /api/v1/sandboxes/{id}/pause
  POST /api/v1/sandboxes/{id}/resume

Settings
  GET  /api/v1/settings
  POST /api/v1/settings
  GET  /api/v1/settings/agent-schema
  GET  /api/v1/settings/conversation-schema

Secrets
  GET    /api/v1/secrets/search
  POST   /api/v1/secrets
  PUT    /api/v1/secrets/{name}
  DELETE /api/v1/secrets/{name}
"""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
import socket
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import docker
import docker.errors
import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

# ── Configuration ─────────────────────────────────────────────────────────────

#: Docker image to use for each conversation sandbox.
AGENT_SERVER_IMAGE: str = os.getenv(
    "AGENT_SERVER_IMAGE",
    "ghcr.io/openhands/agent-server:main-python",
)

#: Port the agent-server listens on *inside* the container (fixed by the image).
CONTAINER_AGENT_SERVER_PORT: int = int(os.getenv("CONTAINER_AGENT_SERVER_PORT", "8000"))

#: Service listen port.
SERVICE_PORT: int = int(os.getenv("PORT", "7999"))

#: Optional bearer API key the service validates.  Empty = accept all keys.
REQUIRED_API_KEY: str = os.getenv("DOCKER_CLOUD_API_KEY", "")

#: Virtual org / user identifiers returned to the frontend.
ORG_ID = "docker-cloud-org"
USER_ID = "docker-cloud-user"

#: How long (seconds) to wait for a container's agent-server to become ready.
CONTAINER_READY_TIMEOUT: int = int(os.getenv("CONTAINER_READY_TIMEOUT", "120"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
log = logging.getLogger("docker-cloud-backend")


# ── In-memory state ────────────────────────────────────────────────────────────

class _Store:
    """Lightweight in-memory store for all runtime state."""

    def __init__(self) -> None:
        # task_id → task dict
        self.tasks: dict[str, dict[str, Any]] = {}
        # conversation_id → conversation dict
        self.conversations: dict[str, dict[str, Any]] = {}
        # sandbox_id (== conversation_id) → sandbox dict
        self.sandboxes: dict[str, dict[str, Any]] = {}
        # Flat settings (llm_model, llm_api_key, llm_base_url, …)
        self.settings: dict[str, Any] = {
            "llm_model":   os.getenv("LLM_MODEL",    ""),
            "llm_api_key": os.getenv("LLM_API_KEY",  ""),
            "llm_base_url": os.getenv("LLM_BASE_URL", ""),
        }
        # secret_name → {name, value, description}
        self.secrets: dict[str, dict[str, str]] = {}


store = _Store()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _find_free_port() -> int:
    """Return an available TCP port on the host."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]


def _docker_client() -> docker.DockerClient:
    return docker.from_env()


def _get_llm_settings() -> dict[str, str]:
    """Return the current LLM settings as a flat dict."""
    s = store.settings
    # Support both top-level flat keys and nested agent_settings.llm
    nested = s.get("agent_settings", {}).get("llm", {}) if isinstance(s.get("agent_settings"), dict) else {}
    return {
        "model":    s.get("llm_model")    or nested.get("model",    ""),
        "api_key":  s.get("llm_api_key")  or nested.get("api_key",  ""),
        "base_url": s.get("llm_base_url") or nested.get("base_url", ""),
    }


# ── Docker helpers ─────────────────────────────────────────────────────────────

async def _wait_for_ready(host_port: int, timeout: int = CONTAINER_READY_TIMEOUT) -> bool:
    """Poll /server_info on localhost:{host_port} until 200 or timeout."""
    url = f"http://localhost:{host_port}/server_info"
    deadline = time.monotonic() + timeout
    log.info("Waiting for agent-server on port %d (timeout %ds)…", host_port, timeout)
    async with httpx.AsyncClient() as client:
        while time.monotonic() < deadline:
            try:
                resp = await client.get(url, timeout=2.0)
                if resp.status_code == 200:
                    log.info("Agent-server on port %d is ready.", host_port)
                    return True
            except Exception:
                pass
            await asyncio.sleep(1)
    log.error("Agent-server on port %d did not become ready within %ds.", host_port, timeout)
    return False


def _start_container(
    conversation_id: str,
    host_port: int,
    session_api_key: str,
    llm: dict[str, str],
    extra_secrets: dict[str, str],
) -> str:
    """
    Launch a new container for the given conversation.

    Returns the Docker container ID.
    """
    client = _docker_client()

    env: dict[str, str] = {
        "OH_SESSION_API_KEYS_0":      session_api_key,
        "SESSION_API_KEY":            session_api_key,
        "OPENHANDS_SUPPRESS_BANNER":  "1",
    }
    if llm.get("model"):
        env["LLM_MODEL"] = llm["model"]
    if llm.get("api_key"):
        env["LLM_API_KEY"] = llm["api_key"]
    if llm.get("base_url"):
        env["LLM_BASE_URL"] = llm["base_url"]

    # Inject custom secrets as plain environment variables
    for name, value in extra_secrets.items():
        env[name] = value

    # Build a deterministic but unique container name.
    # Using the full UUID (hyphens removed) ensures no collisions even
    # if the service is restarted without first cleaning up old containers.
    safe_id = conversation_id.replace("-", "")
    container_name = f"openhands-conv-{safe_id}"

    # Remove a stale container with the same name, if any, before
    # trying to create a new one (happens on service restart without cleanup).
    try:
        stale = client.containers.get(container_name)
        log.warning("Removing stale container %s before re-creating.", container_name)
        try:
            stale.stop(timeout=3)
        except Exception:
            pass
        stale.remove(force=True)
    except docker.errors.NotFound:
        pass

    container = client.containers.run(
        AGENT_SERVER_IMAGE,
        detach=True,
        ports={f"{CONTAINER_AGENT_SERVER_PORT}/tcp": host_port},
        environment=env,
        name=container_name,
        labels={
            "openhands.managed":         "true",
            "openhands.conversation_id": conversation_id,
        },
        # Keep the container after stopping so docker-start works on resume.
        remove=False,
    )
    log.info("Started container %s for conversation %s on host port %d.",
             container.short_id, conversation_id, host_port)
    return container.id


async def _create_conversation_on_container(
    host_port: int,
    session_api_key: str,
    conversation_id: str,
    llm: dict[str, str],
    initial_message: dict[str, Any] | None,
    start_request: dict[str, Any],
) -> dict[str, Any]:
    """
    Call POST /api/conversations on the container's agent-server.

    Passes conversation_id so the container uses the same ID as our
    cloud-side conversation, keeping proxy path params consistent.
    """
    url = f"http://localhost:{host_port}/api/conversations"
    headers = {"X-Session-API-Key": session_api_key}

    agent_settings: dict[str, Any] = {}
    if llm.get("model"):
        llm_cfg: dict[str, Any] = {"model": llm["model"]}
        if llm.get("api_key"):
            llm_cfg["api_key"] = llm["api_key"]
        if llm.get("base_url"):
            llm_cfg["base_url"] = llm["base_url"]
        agent_settings["llm"] = llm_cfg

    # Fall back to a dummy model name so validation doesn't fail even when
    # the user hasn't configured an LLM yet (the real call will fail later
    # at inference time, not at conversation creation time).
    if not agent_settings.get("llm"):
        agent_settings["llm"] = {"model": "gpt-4o-mini"}

    payload: dict[str, Any] = {
        "conversation_id": conversation_id,
        "workspace":       {"working_dir": "/workspace"},
        "agent_settings":  agent_settings,
        "stuck_detection": True,
        "autotitle":       True,
        "worktree":        True,
        "max_iterations":  start_request.get("max_iterations", 500),
    }

    if initial_message:
        payload["initial_message"] = initial_message

    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=payload, headers=headers, timeout=30.0)
        resp.raise_for_status()
        return resp.json()


def _stop_container(container_id: str) -> None:
    try:
        _docker_client().containers.get(container_id).stop(timeout=10)
        log.info("Stopped container %s.", container_id[:12])
    except docker.errors.NotFound:
        log.warning("Container %s not found when stopping.", container_id[:12])


def _start_stopped_container(container_id: str) -> None:
    _docker_client().containers.get(container_id).start()
    log.info("Re-started container %s.", container_id[:12])


def _remove_container(container_id: str) -> None:
    try:
        c = _docker_client().containers.get(container_id)
        try:
            c.stop(timeout=5)
        except Exception:
            pass
        c.remove(force=True)
        log.info("Removed container %s.", container_id[:12])
    except docker.errors.NotFound:
        pass


# ── Background provisioning task ───────────────────────────────────────────────

async def _provision_conversation(task_id: str) -> None:
    """
    Full async lifecycle of creating a Docker sandbox for one conversation.

    Runs in the background immediately after the POST /api/v1/app-conversations
    response is sent.  Updates task/conversation/sandbox records so polling
    endpoints return consistent state at every step.
    """
    task = store.tasks[task_id]
    conversation_id: str = task["_conversation_id"]
    start_request: dict[str, Any] = task["request"]

    # ── Step 1: allocate resources ─────────────────────────────────────────
    task.update(status="WAITING_FOR_SANDBOX", updated_at=_now())

    host_port = _find_free_port()
    session_api_key = secrets.token_hex(32)
    llm = _get_llm_settings()
    extra_secrets = {
        name: info.get("value", "")
        for name, info in store.secrets.items()
    }

    container_id: str | None = None

    try:
        # ── Step 2: start container ────────────────────────────────────────
        container_id = _start_container(
            conversation_id, host_port, session_api_key, llm, extra_secrets
        )

        # Register sandbox early so pause/resume endpoints don't 404 during
        # provisioning.
        store.sandboxes[conversation_id] = {
            "id":               conversation_id,
            "container_id":     container_id,
            "host_port":        host_port,
            "session_api_key":  session_api_key,
            "status":           "STARTING",
            "created_at":       _now(),
        }

        task.update(status="STARTING_CONVERSATION", updated_at=_now())

        # ── Step 3: wait for agent-server inside container to be ready ─────
        ready = await _wait_for_ready(host_port)
        if not ready:
            raise RuntimeError(
                f"Container agent-server on port {host_port} did not become "
                f"ready within {CONTAINER_READY_TIMEOUT}s."
            )
        store.sandboxes[conversation_id]["status"] = "RUNNING"

        # ── Step 4: create the conversation on the container ───────────────
        initial_message = start_request.get("initial_message")
        conv_info = await _create_conversation_on_container(
            host_port=host_port,
            session_api_key=session_api_key,
            conversation_id=conversation_id,
            llm=llm,
            initial_message=initial_message,
            start_request=start_request,
        )

        # The container should echo back the same conversation_id we passed.
        container_conv_id: str = conv_info.get("id", conversation_id)
        if container_conv_id != conversation_id:
            log.warning(
                "Container assigned conversation ID %s; expected %s. "
                "Proxy calls will use the container ID.",
                container_conv_id, conversation_id,
            )

        agent_server_url = f"http://localhost:{host_port}"
        # conversation_url encodes host+port AND the path — downstream code
        # strips everything past the host:port for hostOverride, then
        # appends /api/conversations/{id}/… for REST and
        # /sockets/events/{id} for WebSocket.
        conversation_url = (
            f"http://localhost:{host_port}"
            f"/api/conversations/{container_conv_id}"
        )

        ts = _now()
        store.conversations[conversation_id] = {
            # Cloud-API fields
            "id":                   conversation_id,
            "created_by_user_id":   USER_ID,
            "selected_repository":  start_request.get("selected_repository"),
            "selected_branch":      start_request.get("selected_branch"),
            "git_provider":         start_request.get("git_provider"),
            "title":                start_request.get("title"),
            "trigger":              start_request.get("trigger"),
            "pr_number":            start_request.get("pr_number", []),
            "agent_kind":           "openhands",
            "acp_server":           None,
            "llm_model":            start_request.get("llm_model") or llm.get("model"),
            "metrics":              None,
            "created_at":           ts,
            "updated_at":           ts,
            "execution_status":     "RUNNING",
            "sandbox_status":       "RUNNING",
            "conversation_url":     conversation_url,
            "session_api_key":      session_api_key,
            "sandbox_id":           conversation_id,
            "workspace":            {"working_dir": "/workspace"},
            "public":               False,
            "sub_conversation_ids": [],
            # Internal bookkeeping (excluded from API responses)
            "_container_id":        container_id,
            "_container_conv_id":   container_conv_id,
            "_host_port":           host_port,
            "_agent_server_url":    agent_server_url,
        }

        task.update(
            status="READY",
            app_conversation_id=conversation_id,
            agent_server_url=agent_server_url,
            updated_at=_now(),
        )
        log.info(
            "Conversation %s ready — container port %d — url %s",
            conversation_id, host_port, conversation_url,
        )

    except Exception as exc:  # noqa: BLE001
        log.exception("Failed to provision conversation for task %s", task_id)
        task.update(status="ERROR", detail=str(exc), updated_at=_now())
        if container_id:
            _remove_container(container_id)
        store.sandboxes.pop(conversation_id, None)


async def _resume_sandbox_task(sandbox_id: str) -> None:
    """Restart a stopped container and wait until its agent-server is ready."""
    sb = store.sandboxes.get(sandbox_id)
    if not sb:
        return
    try:
        _start_stopped_container(sb["container_id"])
        ready = await _wait_for_ready(sb["host_port"])
        new_status = "RUNNING" if ready else "ERROR"
    except Exception as exc:  # noqa: BLE001
        log.exception("Failed to resume sandbox %s: %s", sandbox_id, exc)
        new_status = "ERROR"

    sb["status"] = new_status
    conv = store.conversations.get(sandbox_id)
    if conv:
        conv["sandbox_status"] = new_status
        conv["updated_at"] = _now()


# ── Response helpers ───────────────────────────────────────────────────────────

def _pub(d: dict[str, Any] | None) -> dict[str, Any] | None:
    """Strip internal `_*` keys from a record before returning it."""
    if d is None:
        return None
    return {k: v for k, v in d.items() if not k.startswith("_")}


def _sandbox_response(sb: dict[str, Any] | None) -> dict[str, Any] | None:
    if sb is None:
        return None
    conv = store.conversations.get(sb["id"])
    exposed_urls = []
    if conv:
        port = sb["host_port"]
        exposed_urls = [
            {"name": "AGENT_SERVER", "url": f"http://localhost:{port}"},
        ]
    return {
        "id":                   sb["id"],
        "created_by_user_id":   USER_ID,
        "sandbox_spec_id":      "docker-sandbox",
        "status":               sb["status"],
        "session_api_key":      sb.get("session_api_key"),
        "exposed_urls":         exposed_urls,
        "created_at":           sb.get("created_at", _now()),
    }


# ── Lifespan / startup ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Validate Docker connectivity on startup
    try:
        _docker_client().ping()
        log.info("Docker daemon reachable — ready to provision containers.")
    except Exception as exc:
        log.error(
            "Cannot reach Docker daemon: %s\n"
            "Make sure Docker is running and the socket is accessible.",
            exc,
        )
    yield
    # On shutdown: optionally stop all managed containers
    if os.getenv("STOP_CONTAINERS_ON_SHUTDOWN", "false").lower() == "true":
        log.info("Stopping managed containers…")
        for conv in list(store.conversations.values()):
            cid = conv.get("_container_id")
            if cid:
                _remove_container(cid)


# ── Application ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Docker Cloud Backend",
    description="Cloud-API emulator that provisions Docker containers for Agent Canvas conversations.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth / Identity ────────────────────────────────────────────────────────────

@app.get("/api/keys/current")
async def get_current_key():
    """Return metadata for the caller's API key (always accepted)."""
    return {
        "id":        "docker-cloud-key-1",
        "name":      "Docker Cloud Key",
        "org_id":    ORG_ID,
        "user_id":   USER_ID,
        "auth_type": "api_key",
    }


@app.get("/api/organizations")
async def list_organizations():
    """Return the single virtual org exposed by this service."""
    return {
        "items": [
            {
                "id":          ORG_ID,
                "name":        "Docker Cloud (Local)",
                "is_personal": True,
            }
        ],
        "current_org_id": ORG_ID,
    }


@app.get("/api/organizations/{org_id}/me")
async def get_org_member(org_id: str):
    return {
        "org_id":  org_id,
        "user_id": USER_ID,
        "email":   "local@docker-cloud.dev",
        "role":    "admin",
        "status":  "active",
    }


# ── Conversations ──────────────────────────────────────────────────────────────

@app.post("/api/v1/app-conversations", status_code=202)
async def create_app_conversation(
    request: Request, background_tasks: BackgroundTasks
):
    """
    Create a new conversation sandbox.

    Immediately returns a start-task with status WORKING.
    A background task provisions the Docker container and transitions
    the task to READY (or ERROR) once the sandbox is live.
    """
    body: dict[str, Any] = await request.json()

    task_id = str(uuid.uuid4())
    conversation_id = str(uuid.uuid4())
    ts = _now()

    store.tasks[task_id] = {
        "id":                   task_id,
        "created_by_user_id":   USER_ID,
        "status":               "WORKING",
        "detail":               None,
        "app_conversation_id":  None,
        "agent_server_url":     None,
        "request":              body,
        "created_at":           ts,
        "updated_at":           ts,
        # Internal: the conversation_id we intend to create
        "_conversation_id":     conversation_id,
    }

    background_tasks.add_task(_provision_conversation, task_id)
    return _pub(store.tasks[task_id])


@app.get("/api/v1/app-conversations/start-tasks")
async def get_start_tasks(request: Request):
    """
    Batch-fetch start tasks by IDs (?ids=…&ids=…).

    Returns a list where each element is either the task object or null.
    """
    ids = request.query_params.getlist("ids")
    return [_pub(store.tasks.get(tid)) for tid in ids]


@app.get("/api/v1/app-conversations/search")
async def search_conversations(request: Request):
    """Paginated conversation list (newest first)."""
    limit = int(request.query_params.get("limit", "20"))
    page_id_raw = request.query_params.get("page_id")
    start = int(page_id_raw) if page_id_raw and page_id_raw.isdigit() else 0

    items = sorted(
        store.conversations.values(),
        key=lambda c: c["updated_at"],
        reverse=True,
    )
    page = items[start : start + limit]
    next_page_id = str(start + limit) if len(items) > start + limit else None

    return {
        "items":        [_pub(c) for c in page],
        "next_page_id": next_page_id,
    }


@app.get("/api/v1/app-conversations")
async def batch_get_conversations(request: Request):
    """Batch-fetch conversations by IDs (?ids=…&ids=…)."""
    ids = request.query_params.getlist("ids")
    return [_pub(store.conversations.get(cid)) for cid in ids]


@app.delete("/api/v1/app-conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation and stop/remove its Docker container."""
    conv = store.conversations.pop(conversation_id, None)
    if conv and conv.get("_container_id"):
        _remove_container(conv["_container_id"])
    store.sandboxes.pop(conversation_id, None)
    return {"success": True}


@app.patch("/api/v1/app-conversations/{conversation_id}")
async def update_conversation(conversation_id: str, request: Request):
    """Update mutable conversation fields (title, public flag)."""
    body: dict[str, Any] = await request.json()
    conv = store.conversations.get(conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if "public" in body:
        conv["public"] = bool(body["public"])
    if "title" in body:
        conv["title"] = body["title"]
    conv["updated_at"] = _now()
    return _pub(conv)


# ── Sandboxes ──────────────────────────────────────────────────────────────────

@app.get("/api/v1/sandboxes")
async def batch_get_sandboxes(request: Request):
    """Batch-fetch sandbox info by IDs (?id=…&id=…)."""
    ids = request.query_params.getlist("id")
    return [_sandbox_response(store.sandboxes.get(sid)) for sid in ids]


@app.post("/api/v1/sandboxes/{sandbox_id}/pause")
async def pause_sandbox(sandbox_id: str):
    """Stop the Docker container backing this sandbox."""
    sb = store.sandboxes.get(sandbox_id)
    if sb is None:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    _stop_container(sb["container_id"])
    sb["status"] = "PAUSED"
    conv = store.conversations.get(sandbox_id)
    if conv:
        conv["sandbox_status"] = "PAUSED"
        conv["updated_at"] = _now()
    return {"success": True}


@app.post("/api/v1/sandboxes/{sandbox_id}/resume")
async def resume_sandbox(sandbox_id: str, background_tasks: BackgroundTasks):
    """Restart the Docker container and wait for it to be ready."""
    sb = store.sandboxes.get(sandbox_id)
    if sb is None:
        raise HTTPException(status_code=404, detail="Sandbox not found")
    sb["status"] = "STARTING"
    conv = store.conversations.get(sandbox_id)
    if conv:
        conv["sandbox_status"] = "STARTING"
        conv["updated_at"] = _now()
    background_tasks.add_task(_resume_sandbox_task, sandbox_id)
    return {"success": True}


# ── Settings ───────────────────────────────────────────────────────────────────

@app.get("/api/v1/settings")
async def get_settings():
    """Return the current LLM and agent settings in the cloud flat format."""
    s = store.settings
    llm = _get_llm_settings()
    return {
        # Flat top-level fields (read by useUserProviders, etc.)
        "llm_model":        llm["model"],
        "llm_api_key":      llm["api_key"] if llm["api_key"] else None,
        "llm_base_url":     llm["base_url"],
        "llm_api_key_set":  bool(llm["api_key"]),
        "search_api_key_set": False,
        "provider_tokens_set": {},
        "user_consents_to_analytics": False,
        "is_new_user": False,
        "language": s.get("language", "en"),
        "git_user_name":  s.get("git_user_name", ""),
        "git_user_email": s.get("git_user_email", ""),
        # Nested agent_settings (read by settings form components)
        "agent_settings": {
            "llm": {
                "model":    llm["model"],
                "api_key":  llm["api_key"] if llm["api_key"] else None,
                "base_url": llm["base_url"],
            },
        },
        "conversation_settings": {
            "confirmation_mode": s.get("confirmation_mode", False),
            "max_iterations":    s.get("max_iterations", 500),
        },
        "disabled_skills": s.get("disabled_skills", []),
        "mcp_config": s.get("mcp_config", None),
    }


@app.post("/api/v1/settings")
async def save_settings(request: Request):
    """
    Accept settings updates from the frontend.

    The frontend sends either flat fields (language, git_user_name…) or
    diff objects (agent_settings_diff, conversation_settings_diff).
    """
    body: dict[str, Any] = await request.json()

    # Merge flat fields directly
    for key in ("language", "git_user_name", "git_user_email",
                "disabled_skills", "mcp_config", "confirmation_mode",
                "max_iterations"):
        if key in body:
            store.settings[key] = body[key]

    # Apply agent_settings_diff (nested keys under llm, condenser, etc.)
    if isinstance(body.get("agent_settings_diff"), dict):
        diff: dict[str, Any] = body["agent_settings_diff"]
        llm_diff = diff.get("llm", {})
        if isinstance(llm_diff, dict):
            if "model" in llm_diff:
                store.settings["llm_model"]   = llm_diff["model"]
            if "api_key" in llm_diff:
                store.settings["llm_api_key"] = llm_diff["api_key"]
            if "base_url" in llm_diff:
                store.settings["llm_base_url"] = llm_diff["base_url"]
        # Store the rest for future use
        nested = store.settings.setdefault("agent_settings", {})
        for k, v in diff.items():
            if k != "llm":
                nested[k] = v

    # Apply conversation_settings_diff
    if isinstance(body.get("conversation_settings_diff"), dict):
        cdiff: dict[str, Any] = body["conversation_settings_diff"]
        for key in ("confirmation_mode", "max_iterations", "security_analyzer"):
            if key in cdiff:
                store.settings[key] = cdiff[key]

    log.info("Settings updated: model=%s", store.settings.get("llm_model", "<not set>"))
    return {"success": True}


# Minimal schemas — enough for the frontend to not error; the agent-server on
# each container provides its own full schema at /api/settings/agent-schema.
_AGENT_SCHEMA = {
    "sections": [
        {
            "title":  "LLM",
            "key":    "llm",
            "fields": [
                {"key": "model",    "label": "Model",    "type": "str", "default": ""},
                {"key": "api_key",  "label": "API Key",  "type": "str", "secret": True, "default": ""},
                {"key": "base_url", "label": "Base URL", "type": "str", "default": ""},
            ],
        }
    ]
}

_CONVERSATION_SCHEMA = {
    "sections": [
        {
            "title":  "General",
            "key":    "general",
            "fields": [
                {"key": "confirmation_mode", "label": "Confirmation Mode", "type": "bool", "default": False},
                {"key": "max_iterations",    "label": "Max Iterations",    "type": "int",  "default": 500},
            ],
        }
    ]
}


@app.get("/api/v1/settings/agent-schema")
async def get_agent_schema():
    return _AGENT_SCHEMA


@app.get("/api/v1/settings/conversation-schema")
async def get_conversation_schema():
    return _CONVERSATION_SCHEMA


# ── Secrets ────────────────────────────────────────────────────────────────────

@app.get("/api/v1/secrets/search")
async def list_secrets(request: Request):
    limit = int(request.query_params.get("limit", "100"))
    page_id_raw = request.query_params.get("page_id")
    start = int(page_id_raw) if page_id_raw and page_id_raw.isdigit() else 0

    items = [
        {"name": s["name"], "description": s.get("description", "")}
        for s in store.secrets.values()
    ]
    page = items[start : start + limit]
    return {
        "items":        page,
        "next_page_id": str(start + limit) if len(items) > start + limit else None,
    }


@app.post("/api/v1/secrets", status_code=201)
async def create_secret(request: Request):
    body: dict[str, Any] = await request.json()
    name = body["name"]
    store.secrets[name] = {
        "name":        name,
        "value":       body.get("value", ""),
        "description": body.get("description", ""),
    }
    return {"success": True}


@app.put("/api/v1/secrets/{name}")
async def update_secret(name: str, request: Request):
    body: dict[str, Any] = await request.json()
    new_name = body.get("name", name)
    if name in store.secrets:
        old = store.secrets.pop(name)
        store.secrets[new_name] = {
            **old,
            "name":        new_name,
            "description": body.get("description", old.get("description", "")),
        }
    return {"success": True}


@app.delete("/api/v1/secrets/{name}")
async def delete_secret(name: str):
    store.secrets.pop(name, None)
    return {"success": True}


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "conversations": len(store.conversations)}


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    log.info("Starting Docker Cloud Backend on port %d", SERVICE_PORT)
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=SERVICE_PORT,
        reload=False,
    )
