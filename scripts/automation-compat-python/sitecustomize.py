from __future__ import annotations

import os
import tempfile
from pathlib import Path
from urllib.parse import quote, urlparse


def _is_enabled() -> bool:
    return os.environ.get("OPENHANDS_AGENT_CANVAS_AUTOMATION_COMPAT") == "1"


def _is_local_agent_url(agent_url: str) -> bool:
    host = urlparse(agent_url).hostname
    return host in {"localhost", "127.0.0.1", "::1"}


def _local_tarball_path(run_id: str | None = None) -> str:
    filename = "automation.tar.gz"
    if run_id:
        filename = f"automation-{run_id}.tar.gz"

    if os.name == "nt":
        return str(Path(tempfile.gettempdir()) / filename)
    return f"/tmp/{filename}"


def _resolve_tarball_path(agent_url: str, run_id: str | None = None) -> str:
    if _is_local_agent_url(agent_url):
        return _local_tarball_path(run_id)
    return "/tmp/automation.tar.gz"


def _patch_automation_execution() -> None:
    from openhands.automation import execution

    async def _patched_upload(client, agent_url, session_key, data, dest):
        encoded_dest = quote(dest, safe="")
        response = await client.post(
            f"{agent_url}/api/file/upload/{encoded_dest}",
            files={"file": ("upload", data)},
            headers={"X-Session-API-Key": session_key},
        )
        response.raise_for_status()

    async def _patched_execute_in_context(
        client,
        agent_url,
        session_key,
        entrypoint,
        tarball_source,
        work_dir,
        env_vars=None,
        timeout=None,
        run_id=None,
        sandbox_id=None,
    ):
        if timeout is None:
            timeout = execution.get_config().sandbox.max_run_duration

        env_vars = dict(env_vars) if env_vars else {}

        def _log_ctx():
            return execution.log_extra(run_id=run_id, sandbox_id=sandbox_id)

        tarball_path = _resolve_tarball_path(agent_url, run_id)

        try:
            if isinstance(tarball_source, bytes):
                execution.logger.info("Uploading tarball", extra=_log_ctx())
                await execution._upload(
                    client, agent_url, session_key, tarball_source, tarball_path
                )
            else:
                execution.logger.info(
                    "Downloading tarball from URL", extra=_log_ctx()
                )
                await execution._download_in_sandbox(
                    client, agent_url, session_key, tarball_source, tarball_path
                )

            exports = ""
            if env_vars:
                parts = [
                    f"export {key}={execution._shell_quote(value)}"
                    for key, value in env_vars.items()
                ]
                exports = " && ".join(parts) + " && "

            cleanup = " && rm -f " + tarball_path if _is_local_agent_url(agent_url) else ""
            command = (
                f"mkdir -p {work_dir}"
                f" && tar xzf {tarball_path} -C {work_dir}"
                f"{cleanup}"
                f" && cd {work_dir}"
                f" && {exports}([ ! -f setup.sh ] || bash setup.sh)"
                f" && {entrypoint}"
            )

            execution.logger.info(
                "Starting entrypoint: %s", entrypoint, extra=_log_ctx()
            )
            command_id = await execution._start_bash(
                client, agent_url, session_key, command, timeout=timeout
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
        except Exception as exc:  # pragma: no cover - mirrors upstream fallback
            execution.logger.exception("Execution failed", extra=_log_ctx())
            return execution.DispatchResult(
                success=False,
                sandbox_id=sandbox_id,
                error=str(exc),
            )

    execution._upload = _patched_upload
    execution.execute_in_context = _patched_execute_in_context


if _is_enabled():
    try:
        _patch_automation_execution()
    except ModuleNotFoundError:
        pass
