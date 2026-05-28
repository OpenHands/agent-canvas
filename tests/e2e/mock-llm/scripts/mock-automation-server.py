"""Mock Automation API server for E2E tests.

Provides a lightweight in-memory implementation of the automation service API.
Supports creating automations via the prompt preset, listing them, dispatching
runs, and listing runs. Runs are auto-completed after a short delay.

Usage:
    python mock-automation-server.py [--port PORT]
"""

import json
import sys
import threading
import time
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# ── In-memory state ──────────────────────────────────────────────────────

automations: dict[str, dict] = {}
runs: dict[str, list[dict]] = {}  # automation_id -> list of runs
state_lock = threading.Lock()

AUTO_COMPLETE_DELAY = 0.5  # seconds before a run auto-completes


def make_automation(name: str, prompt: str, trigger: dict) -> dict:
    aid = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {
        "id": aid,
        "name": name,
        "prompt": prompt,
        "trigger": trigger,
        "enabled": True,
        "created_at": now,
        "updated_at": now,
        "repository": None,
        "model": None,
        "branch": None,
        "plugins": [],
        "notification": None,
        "timezone": trigger.get("timezone", "UTC"),
        "last_triggered_at": None,
    }


def make_run(automation_id: str) -> dict:
    rid = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {
        "id": rid,
        "automation_id": automation_id,
        "status": "PENDING",
        "conversation_id": None,
        "bash_command_id": None,
        "error_detail": None,
        "started_at": now,
        "completed_at": None,
    }


def auto_complete_run(automation_id: str, run_id: str):
    """Background thread that transitions a run PENDING → RUNNING → COMPLETED."""
    time.sleep(AUTO_COMPLETE_DELAY / 2)
    with state_lock:
        for r in runs.get(automation_id, []):
            if r["id"] == run_id:
                r["status"] = "RUNNING"
                break

    time.sleep(AUTO_COMPLETE_DELAY / 2)
    with state_lock:
        for r in runs.get(automation_id, []):
            if r["id"] == run_id:
                r["status"] = "COMPLETED"
                r["completed_at"] = time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
                )
                break


# ── HTTP Handler ─────────────────────────────────────────────────────────


class MockAutomationHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        qs = parse_qs(parsed.query)

        # Health check (both root and /api/automation/health)
        if path in ("", "/health", "/api/automation/health"):
            return self._json(200, {"status": "ok"})

        # List automations: GET /api/automation/v1
        if path == "/api/automation/v1":
            with state_lock:
                items = list(automations.values())
            limit = int(qs.get("limit", ["50"])[0])
            offset = int(qs.get("offset", ["0"])[0])
            page = items[offset : offset + limit]
            return self._json(200, {"automations": page, "total": len(items)})

        # Get single automation: GET /api/automation/v1/{id}
        if path.startswith("/api/automation/v1/") and "/runs" not in path and "/dispatch" not in path:
            aid = path.split("/api/automation/v1/")[1]
            with state_lock:
                auto = automations.get(aid)
            if auto:
                return self._json(200, auto)
            return self._json(404, {"detail": "Not found"})

        # List runs: GET /api/automation/v1/{id}/runs
        if "/runs" in path:
            parts = path.split("/")
            # /api/automation/v1/{id}/runs
            aid = parts[4] if len(parts) > 5 else ""
            with state_lock:
                run_list = runs.get(aid, [])
            limit = int(qs.get("limit", ["50"])[0])
            offset = int(qs.get("offset", ["0"])[0])
            page = run_list[offset : offset + limit]
            return self._json(200, {"runs": page, "total": len(run_list)})

        self._json(404, {"detail": f"Unknown GET {path}"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        body = self._read_body()

        # Create via prompt preset: POST /api/automation/v1/preset/prompt
        if path == "/api/automation/v1/preset/prompt":
            name = body.get("name", "Unnamed")
            prompt = body.get("prompt", "")
            trigger = body.get("trigger", {"type": "cron", "schedule": "0 9 * * *"})
            auto = make_automation(name, prompt, trigger)
            with state_lock:
                automations[auto["id"]] = auto
                runs[auto["id"]] = []
            return self._json(201, auto)

        # Dispatch: POST /api/automation/v1/{id}/dispatch
        if "/dispatch" in path:
            parts = path.split("/")
            aid = parts[4] if len(parts) > 5 else ""
            with state_lock:
                auto = automations.get(aid)
            if not auto:
                return self._json(404, {"detail": "Automation not found"})

            run = make_run(aid)
            with state_lock:
                runs.setdefault(aid, []).append(run)

            # Auto-complete the run in the background
            t = threading.Thread(
                target=auto_complete_run, args=(aid, run["id"]), daemon=True
            )
            t.start()
            return self._json(201, run)

        # Admin: reset state
        if path == "/admin/reset":
            with state_lock:
                automations.clear()
                runs.clear()
            return self._json(200, {"status": "reset"})

        self._json(404, {"detail": f"Unknown POST {path}"})

    def do_PATCH(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        body = self._read_body()

        # Update automation: PATCH /api/automation/v1/{id}
        if path.startswith("/api/automation/v1/"):
            aid = path.split("/api/automation/v1/")[1]
            with state_lock:
                auto = automations.get(aid)
                if not auto:
                    return self._json(404, {"detail": "Not found"})
                for k, v in body.items():
                    if k in auto:
                        auto[k] = v
                auto["updated_at"] = time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
                )
            return self._json(200, auto)

        self._json(404, {"detail": f"Unknown PATCH {path}"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path.startswith("/api/automation/v1/"):
            aid = path.split("/api/automation/v1/")[1]
            with state_lock:
                automations.pop(aid, None)
                runs.pop(aid, None)
            return self._json(204, None)

        self._json(404, {"detail": f"Unknown DELETE {path}"})

    # ── Helpers ───────────────────────────────────────────────────────

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length:
            return json.loads(self.rfile.read(length))
        return {}

    def _json(self, status: int, payload):
        if payload is None:
            self.send_response(status)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def log_message(self, format, *args):
        print(f"[mock-automation] {args[0]}", file=sys.stderr, flush=True)


def serve(port: int = 18299):
    server = HTTPServer(("127.0.0.1", port), MockAutomationHandler)
    print(f"Mock Automation server ready on http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Mock Automation API server")
    parser.add_argument("--port", type=int, default=18299)
    args = parser.parse_args()
    serve(args.port)
