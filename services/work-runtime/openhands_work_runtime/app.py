from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

API_PREFIX = "/api/work"
MANIFEST_PATH_ENV = "WORK_RUNTIME_MANIFEST_PATH"
API_KEY_ENV = "WORK_RUNTIME_LOCAL_API_KEY"

app = FastAPI(title="OpenHands Work Runtime", openapi_url=f"{API_PREFIX}/openapi.json")


class WorkManifest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "Default Work Workspace"
    grantedFolders: list[str] = Field(default_factory=list)
    deliverablesPath: str = ""
    defaultOptionalTools: list[str] = Field(default_factory=list)


class ValidatePathsRequest(BaseModel):
    paths: list[str] = Field(default_factory=list)


class PathValidationResult(BaseModel):
    path: str
    exists: bool


class ValidatePathsResponse(BaseModel):
    results: list[PathValidationResult]


def manifest_path() -> Path:
    raw = os.environ.get(MANIFEST_PATH_ENV, "").strip()
    if not raw:
        raise HTTPException(status_code=500, detail="WORK_RUNTIME_MANIFEST_PATH is not set")
    path = Path(raw).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def verify_auth(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    expected = os.environ.get(API_KEY_ENV, "").strip()
    if not expected:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid Bearer token")


def load_manifest() -> WorkManifest | None:
    path = manifest_path()
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return WorkManifest.model_validate(data)


def save_manifest(manifest: WorkManifest) -> WorkManifest:
    path = manifest_path()
    path.write_text(manifest.model_dump_json(indent=2), encoding="utf-8")
    return manifest


@app.get(f"{API_PREFIX}/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get(f"{API_PREFIX}/manifest", dependencies=[Depends(verify_auth)])
def get_manifest() -> WorkManifest:
    manifest = load_manifest()
    if manifest is None:
        return WorkManifest()
    return manifest


@app.put(f"{API_PREFIX}/manifest", dependencies=[Depends(verify_auth)])
def put_manifest(manifest: WorkManifest) -> WorkManifest:
    if not manifest.id:
        manifest.id = str(uuid.uuid4())
    return save_manifest(manifest)


@app.post(
    f"{API_PREFIX}/manifest/validate-paths",
    dependencies=[Depends(verify_auth)],
)
def validate_paths(body: ValidatePathsRequest) -> ValidatePathsResponse:
    results = [
        PathValidationResult(
            path=entry,
            exists=Path(entry).expanduser().is_dir(),
        )
        for entry in body.paths
    ]
    return ValidatePathsResponse(results=results)


def main() -> None:
    import uvicorn

    host = os.environ.get("WORK_RUNTIME_HOST", "127.0.0.1")
    port = int(os.environ.get("WORK_RUNTIME_PORT", "18002"))
    uvicorn.run("openhands_work_runtime.app:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
