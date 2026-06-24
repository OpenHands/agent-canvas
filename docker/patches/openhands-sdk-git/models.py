# SPOTWISE PATCH — pinned to openhands-sdk 1.29.0.
# Adds optional `additions`/`deletions` line counts to GitChange so the
# /git/changes endpoint can surface diff stats. Injected over the baked SDK
# by docker/Dockerfile. Re-sync this file if config/defaults.json bumps the
# agentServer pin. Upstream source: openhands-sdk/openhands/sdk/git/models.py
from enum import Enum
from pathlib import Path

from pydantic import BaseModel, field_serializer

from openhands.sdk.utils.path import to_posix_path


class GitChangeStatus(Enum):
    MOVED = "MOVED"
    ADDED = "ADDED"
    DELETED = "DELETED"
    UPDATED = "UPDATED"


class GitChange(BaseModel):
    status: GitChangeStatus
    path: Path
    # Line counts from `git diff --numstat`. `None` when unknown (binary files,
    # untracked files, or renames whose numstat path does not resolve).
    additions: int | None = None
    deletions: int | None = None

    @field_serializer("path", when_used="json")
    def _serialize_path(self, path: Path) -> str:
        return to_posix_path(path)


class GitDiff(BaseModel):
    modified: str | None
    original: str | None
