"""Automation dev-time patches.

This module is imported automatically by Python (via `sitecustomize`) when it is
present on PYTHONPATH.

We use it in `npm run dev` on Windows to patch OpenHands Automations so the
agent-server file upload path is Windows-absolute (drive-qualified) instead of
POSIX-style `/tmp/...`.

This is intentionally scoped to the automation backend process only.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any


def _as_shell_path(p: Path) -> str:
    # Prefer MSYS/Git-Bash style paths on Windows so tools like `tar`
    # don't interpret drive letters (e.g. `C:/...`) as remote archives
    # (`host:file`).
    resolved = p.resolve().as_posix()

    if os.name == "nt":
        # Convert `C:/Users/...` -> `/c/Users/...`
        if len(resolved) >= 3 and resolved[1] == ":" and resolved[2] == "/":
            drive = resolved[0].lower()
            return f"/{drive}{resolved[2:]}"

    return resolved


def _patch_automation_tarball_path() -> None:
    if os.name != "nt":
        return

    if os.environ.get("OH_DISABLE_AUTOMATION_TARBALL_PATCH") == "1":
        return

    try:
        import openhands.automation.execution as execution
        from openhands.automation.constants import TARBALL_PATH
    except Exception:
        return

    original = getattr(execution, "execute_in_context", None)
    if original is None:
        return

    async def execute_in_context_patched(
        client: Any,
        agent_url: str,
        session_key: str,
        entrypoint: str,
        tarball_source: bytes | str,
        work_dir: str,
        env_vars: dict[str, str] | None = None,
        timeout: int | None = None,
        run_id: str | None = None,
        sandbox_id: str | None = None,
    ):
        # Mirror upstream logic, but use a Windows-absolute temp path.
        # Upstream uses `/tmp/automation-<run_id>.tar.gz`, which is not
        # considered absolute by pathlib on Windows, causing agent-server
        # /api/file/upload to reject it.
        if timeout is None:
            timeout = execution.get_config().sandbox.max_run_duration

        env_vars = dict(env_vars) if env_vars else {}

        def _log_ctx() -> dict[str, Any]:
            return execution.log_extra(run_id=run_id, sandbox_id=sandbox_id)

        def _as_upload_path(p: Path) -> str:
            # Must be Windows-absolute (drive-qualified) for agent-server's
            # /api/file/upload validation.
            return p.resolve().as_posix()

        if run_id and "/" not in run_id:
            tarball_upload_path = _as_upload_path(
                Path(tempfile.gettempdir()) / f"automation-{run_id}.tar.gz"
            )
        else:
            # Keep protocol default for sandbox extraction, but map it to a
            # Windows absolute path for the host agent-server.
            tarball_upload_path = _as_upload_path(
                Path(tempfile.gettempdir()) / Path(TARBALL_PATH).name
            )

        tarball_shell_path = _as_shell_path(Path(tarball_upload_path))

        try:
            if isinstance(tarball_source, bytes):
                execution.logger.info("Uploading tarball", extra=_log_ctx())
                await execution._upload(
                    client,
                    agent_url,
                    session_key,
                    tarball_source,
                    tarball_upload_path,
                )
            else:
                execution.logger.info("Downloading tarball from URL", extra=_log_ctx())
                await execution._download_in_sandbox(
                    client,
                    agent_url,
                    session_key,
                    tarball_source,
                    tarball_upload_path,
                )

            exports = ""
            if env_vars:
                parts = [
                    f"export {k}={execution._shell_quote(v)}" for k, v in env_vars.items()
                ]
                exports = " && ".join(parts) + " && "

            tarball_q = execution._shell_quote(tarball_shell_path)
            work_dir_shell = _as_shell_path(Path(work_dir))
            work_dir_q = execution._shell_quote(work_dir_shell)

            def _python_fallback(payload: str) -> str:
                return (
                    f"(command -v python3 >/dev/null 2>&1 && python3 {payload})"
                    f" || (command -v python >/dev/null 2>&1 && python {payload})"
                    f" || (command -v py >/dev/null 2>&1 && py -3 {payload})"
                )

            entrypoint_shell = entrypoint
            stripped_entrypoint = entrypoint_shell.strip()

            # Handle Windows shells that don't provide `python3`.
            if stripped_entrypoint.startswith("python3 "):
                payload = stripped_entrypoint[len("python3 ") :]
                entrypoint_shell = _python_fallback(payload)

            # Handle upstream automation entrypoints that assume a Unix venv
            # path (`.venv/bin/python ...`). On native Windows venvs live under
            # `.venv/Scripts/python.exe`.
            elif stripped_entrypoint.startswith(".venv/bin/python "):
                payload = stripped_entrypoint[len(".venv/bin/python ") :]
                entrypoint_shell = (
                    f"([ -f .venv/Scripts/python.exe ] && .venv/Scripts/python.exe {payload})"
                    f" || ([ -f .venv/bin/python ] && .venv/bin/python {payload})"
                    f" || {_python_fallback(payload)}"
                )

            # If the upstream string uses backslashes (Windows style), normalize
            # it for MSYS bash.
            elif stripped_entrypoint.startswith(".venv\\\\Scripts\\\\python.exe "):
                payload = stripped_entrypoint[len(".venv\\\\Scripts\\\\python.exe ") :]
                entrypoint_shell = (
                    f"([ -f .venv/Scripts/python.exe ] && .venv/Scripts/python.exe {payload})"
                    f" || {_python_fallback(payload)}"
                )

            cmd = (
                f"mkdir -p {work_dir_q}"
                f" && tar xzf {tarball_q} -C {work_dir_q}"
                f" && rm -f {tarball_q}"
                f" && cd {work_dir_q}"
                f" && {exports}([ ! -f setup.sh ] || bash setup.sh)"
                f" && {entrypoint_shell}"
            )

            execution.logger.info("Starting entrypoint: %s", entrypoint, extra=_log_ctx())
            command_id = await execution._start_bash(
                client, agent_url, session_key, cmd, timeout=timeout
            )
            execution.logger.info(
                "Entrypoint started (command_id=%s), disconnecting",
                command_id,
                extra=_log_ctx(),
            )

            return execution.DispatchResult(
                success=True,
                sandbox_id=sandbox_id,
                bash_command_id=command_id,
            )

        except execution.PermanentDispatchError:
            raise

    execution.execute_in_context = execute_in_context_patched


_patch_automation_tarball_path()
