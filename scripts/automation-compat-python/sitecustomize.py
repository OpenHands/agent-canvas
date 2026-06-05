from __future__ import annotations

import copy
import io
import os
import tarfile
import tempfile
from pathlib import Path
from urllib.parse import quote, urlencode, urlparse

_AUTOMATION_RUN_CONTRACT = """## Automation Run Contract

You are running inside one scheduled automation invocation. Do one bounded pass,
then finish. Do not start long-running monitors, background services, daemon
processes, infinite polling loops, or watch commands.

If the task asks you to monitor, poll, or watch an external service, treat this
run as a single poll cycle: fetch the relevant recent state once, process at most
one eligible item that has not already been handled, perform the requested side
effect, and exit. If there is no eligible work, say that no matching work was
found and exit successfully.

For chat or message monitors, inspect existing thread/history state before
posting so a retried run does not duplicate replies. If you cannot complete the
requested side effect, report the error clearly and exit instead of waiting
forever.
"""

_PROMPT_TIMEOUT_HELPERS = r"""
import os
import queue
import threading

DEFAULT_AUTOMATION_CONVERSATION_TIMEOUT_SECONDS = 540


def _automation_conversation_timeout_seconds() -> float:
    raw_timeout = (
        os.environ.get("AUTOMATION_CONVERSATION_TIMEOUT_SECONDS")
        or os.environ.get("AUTOMATION_RUN_TIMEOUT_SECONDS")
    )
    try:
        timeout_seconds = (
            float(raw_timeout)
            if raw_timeout
            else DEFAULT_AUTOMATION_CONVERSATION_TIMEOUT_SECONDS
        )
    except ValueError:
        timeout_seconds = DEFAULT_AUTOMATION_CONVERSATION_TIMEOUT_SECONDS
    return max(timeout_seconds, 1.0)


def _run_conversation_with_timeout(conversation, timeout_seconds: float) -> None:
    result_queue = queue.Queue(maxsize=1)

    def _target() -> None:
        try:
            conversation.run()
        except BaseException as exc:
            result_queue.put(exc)
        else:
            result_queue.put(None)

    thread = threading.Thread(
        target=_target,
        name="automation-conversation-runner",
        daemon=True,
    )
    thread.start()
    thread.join(timeout_seconds)
    if thread.is_alive():
        try:
            conversation.close()
        except Exception:
            pass
        raise TimeoutError(
            "conversation.run() did not finish within "
            f"{timeout_seconds:.0f} seconds"
        )

    exc = result_queue.get_nowait()
    if exc is not None:
        raise exc
"""


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


def _shell_path(path: str) -> str:
    if os.name == "nt":
        return path.replace("\\", "/")
    return path


def _member_key(name: str) -> str:
    if name.startswith("./"):
        return name[2:]
    return name


def _patch_prompt_main(source: str) -> str:
    if "_run_conversation_with_timeout" in source:
        return source

    if "conversation.run()" not in source:
        return source

    if "        conversation.run()\n" in source:
        run_target = "        conversation.run()\n"
        run_replacement_indent = "        "
    elif "    conversation.run()\n" in source:
        run_target = "    conversation.run()\n"
        run_replacement_indent = "    "
    else:
        return source

    run_placeholder = (
        f"{run_replacement_indent}"
        "__AGENT_CANVAS_AUTOMATION_CONVERSATION_RUN_PLACEHOLDER__\n"
    )
    source = source.replace(run_target, run_placeholder, 1)

    if "import time\n" in source:
        source = source.replace(
            "import time\n",
            f"import time\n{_PROMPT_TIMEOUT_HELPERS}\n",
            1,
        )
    else:
        source = f"{_PROMPT_TIMEOUT_HELPERS}\n{source}"

    timeout_run = (
        "        timeout_seconds = _automation_conversation_timeout_seconds()\n"
        "        print(\n"
        '            f"  conversation timeout: {timeout_seconds:.0f} seconds",\n'
        "            flush=True,\n"
        "        )\n"
        "        _run_conversation_with_timeout(conversation, timeout_seconds)\n"
    )
    if run_replacement_indent == "    ":
        timeout_run = timeout_run.replace("        ", "    ")
    return source.replace(run_placeholder, timeout_run, 1)


def _patch_prompt_text(source: str) -> str:
    if "## Automation Run Contract" in source:
        return source
    return f"{_AUTOMATION_RUN_CONTRACT}\n{source}"


def _patch_prompt_tarball(data: bytes) -> tuple[bytes, bool]:
    try:
        input_buffer = io.BytesIO(data)
        with tarfile.open(fileobj=input_buffer, mode="r:gz") as tar:
            members = tar.getmembers()
            file_payloads: dict[str, bytes] = {}
            for member in members:
                if not member.isfile():
                    continue

                extracted = tar.extractfile(member)
                if extracted is not None:
                    file_payloads[member.name] = extracted.read()
    except (tarfile.TarError, OSError):
        return data, False

    key_to_name = {_member_key(name): name for name in file_payloads}
    main_name = key_to_name.get("main.py")
    prompt_name = key_to_name.get("prompt.txt")
    if not main_name or not prompt_name:
        return data, False

    try:
        main_source = file_payloads[main_name].decode("utf-8")
        prompt_source = file_payloads[prompt_name].decode("utf-8")
    except UnicodeDecodeError:
        return data, False

    patched_main = _patch_prompt_main(main_source)
    patched_prompt = _patch_prompt_text(prompt_source)
    if patched_main == main_source and patched_prompt == prompt_source:
        return data, False

    replacements = {
        main_name: patched_main.encode("utf-8"),
        prompt_name: patched_prompt.encode("utf-8"),
    }

    output_buffer = io.BytesIO()
    with tarfile.open(fileobj=output_buffer, mode="w:gz") as patched_tar:
        for member in members:
            patched_member = copy.copy(member)
            replacement = replacements.get(member.name)
            if replacement is not None:
                patched_member.size = len(replacement)
                patched_tar.addfile(patched_member, io.BytesIO(replacement))
            elif member.isfile():
                payload = file_payloads.get(member.name, b"")
                patched_member.size = len(payload)
                patched_tar.addfile(patched_member, io.BytesIO(payload))
            else:
                patched_tar.addfile(patched_member)

    return output_buffer.getvalue(), True


def _patch_automation_execution() -> None:
    from openhands.automation import execution

    async def _patched_upload(client, agent_url, session_key, data, dest):
        params = urlencode({"path": dest})
        response = await client.post(
            f"{agent_url}/api/file/upload?{params}",
            files={"file": ("upload", data)},
            headers={"X-Session-API-Key": session_key},
        )
        if response.status_code not in {404, 405}:
            response.raise_for_status()
            return

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
        if timeout is not None:
            run_timeout = max(int(timeout), 1)
            env_vars.setdefault("AUTOMATION_RUN_TIMEOUT_SECONDS", str(run_timeout))
            env_vars.setdefault(
                "AUTOMATION_CONVERSATION_TIMEOUT_SECONDS",
                str(max(run_timeout - 60, 1)),
            )

        def _log_ctx():
            return execution.log_extra(run_id=run_id, sandbox_id=sandbox_id)

        tarball_path = _resolve_tarball_path(agent_url, run_id)

        try:
            if isinstance(tarball_source, bytes):
                tarball_source, patched_prompt_tarball = _patch_prompt_tarball(
                    tarball_source
                )
                if patched_prompt_tarball:
                    execution.logger.info(
                        "Patched prompt automation tarball", extra=_log_ctx()
                    )
                execution.logger.info("Uploading tarball", extra=_log_ctx())
                await execution._upload(
                    client, agent_url, session_key, tarball_source, tarball_path
                )
            else:
                execution.logger.info(
                    "Downloading tarball from URL", extra=_log_ctx()
                )
                await execution._download_in_sandbox(
                    client,
                    agent_url,
                    session_key,
                    tarball_source,
                    _shell_path(tarball_path),
                )

            exports = ""
            if env_vars:
                parts = [
                    f"export {key}={execution._shell_quote(value)}"
                    for key, value in env_vars.items()
                ]
                exports = " && ".join(parts) + " && "

            tarball_arg = execution._shell_quote(_shell_path(tarball_path))
            work_dir_arg = execution._shell_quote(_shell_path(work_dir))
            cleanup = (
                f" && rm -f {tarball_arg}" if _is_local_agent_url(agent_url) else ""
            )
            command = (
                f"mkdir -p {work_dir_arg}"
                f" && tar xzf {tarball_arg} -C {work_dir_arg}"
                f"{cleanup}"
                f" && cd {work_dir_arg}"
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
