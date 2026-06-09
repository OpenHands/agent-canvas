"""Agent-server dev-time patches.

Imported automatically by Python (via `sitecustomize`) when this directory is
on PYTHONPATH.

On Windows, OpenHands agent-server executes "bash" commands using
`asyncio.create_subprocess_shell(..., shell=True)`, which routes through `cmd.exe`.
That breaks automation dispatch (it relies on POSIX commands like `mkdir -p`).

This patch wraps bash commands so they execute under Git Bash / MSYS2 bash when
available.

Only intended for local dev/testing.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any, Callable


def _find_bash() -> str | None:
    # Prefer explicit override.
    override = os.environ.get("OH_BASH_PATH")
    if override:
        p = Path(override)
        if p.exists():
            return str(p)

    # Prefer Git for Windows' bash explicitly. This avoids accidentally picking
    # WSL's `C:\Windows\System32\bash.exe` (which does not provide `/c/...`
    # mounts and breaks path handling).
    program_files = [
        os.environ.get("ProgramFiles"),
        os.environ.get("ProgramFiles(x86)"),
        os.environ.get("LOCALAPPDATA"),
    ]
    git_candidates: list[Path] = []
    for root in filter(None, program_files):
        r = Path(root)
        git_candidates.extend(
            [
                r / "Git" / "bin" / "bash.exe",
                r / "Git" / "usr" / "bin" / "bash.exe",
            ]
        )

    for c in git_candidates:
        if c.exists():
            return str(c)

    # Fall back to PATH, but skip WSL's bash launcher.
    on_path = shutil.which("bash")
    if on_path:
        lower = on_path.lower().replace("/", "\\")
        if "\\windows\\system32\\bash.exe" not in lower and "\\system32\\bash.exe" not in lower:
            return on_path

    return None


def _quote_cmd_arg(s: str) -> str:
    # Conservative quoting for cmd.exe command lines.
    # We wrap the entire bash script in double-quotes; escape any embedded quotes.
    return '"' + s.replace('"', r'\"') + '"'


def _patch_bash_execution() -> None:
    if os.name != "nt":
        return

    if os.environ.get("OH_DISABLE_AGENT_SERVER_BASH_PATCH") == "1":
        return

    bash = _find_bash()
    if not bash:
        # No bash found; leave behavior unchanged.
        return

    try:
        from openhands.agent_server.bash_service import BashEventService
    except Exception:
        return

    original_execute: Callable[[Any, Any], Any] | None = getattr(
        BashEventService, "_execute_bash_command", None
    )
    if original_execute is None:
        return

    async def _execute_bash_command_patched(self: Any, command: Any) -> None:
        cmd = getattr(command, "command", "")
        if isinstance(cmd, str) and cmd and not cmd.lstrip().startswith("bash "):
            wrapped = f'"{bash}" -lc {_quote_cmd_arg(cmd)}'
            command.command = wrapped
        return await original_execute(self, command)

    BashEventService._execute_bash_command = _execute_bash_command_patched


_patch_bash_execution()
