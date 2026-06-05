// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const compatPythonPath = path.join(
  repoRoot,
  "scripts",
  "automation-compat-python",
);

type PythonCommand = {
  command: string;
  argsPrefix: string[];
};

function findPython(): PythonCommand | null {
  const candidates: PythonCommand[] =
    process.platform === "win32"
      ? [
          { command: "python", argsPrefix: [] },
          { command: "py", argsPrefix: ["-3"] },
        ]
      : [
          { command: "python3", argsPrefix: [] },
          { command: "python", argsPrefix: [] },
        ];

  for (const candidate of candidates) {
    const result = spawnSync(
      candidate.command,
      [...candidate.argsPrefix, "--version"],
      { encoding: "utf8" },
    );
    if (result.status === 0) {
      return candidate;
    }
  }

  return null;
}

function writeFakeAutomationPackage(root: string) {
  const packageDir = path.join(root, "openhands", "automation");
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(path.join(root, "openhands", "__init__.py"), "");
  writeFileSync(path.join(packageDir, "__init__.py"), "");
  writeFileSync(
    path.join(packageDir, "execution.py"),
    String.raw`
from dataclasses import dataclass


class _SandboxConfig:
    max_run_duration = 300


class _Config:
    sandbox = _SandboxConfig()


def get_config():
    return _Config()


def log_extra(**kwargs):
    return kwargs


class PermanentDispatchError(Exception):
    pass


@dataclass
class DispatchResult:
    success: bool
    sandbox_id: str | None = None
    error: str | None = None
    bash_command_id: str | None = None


class _Logger:
    def info(self, *args, **kwargs):
        pass

    def exception(self, *args, **kwargs):
        pass


logger = _Logger()
last_command = None
last_download_dest = None


def _shell_quote(value):
    return "'" + value.replace("'", "'\\''") + "'"


async def _download_in_sandbox(client, agent_url, session_key, tarball_url, dest):
    global last_download_dest
    last_download_dest = dest


async def _start_bash(client, agent_url, session_key, command, timeout=None):
    global last_command
    last_command = command
    return "bash-command-id"
`,
  );
}

const python = findPython();
const describePython = python ? describe : describe.skip;

describePython("automation compatibility Python shim", () => {
  it("uses upload routes compatible with pinned and newer agent servers", () => {
    const fakeRoot = mkdtempSync(path.join(tmpdir(), "automation-compat-"));
    writeFakeAutomationPackage(fakeRoot);

    const script = String.raw`
import asyncio
import io
import json
import sitecustomize
import tarfile

from openhands.automation import execution


class Response:
    def __init__(self, status_code):
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class Client:
    def __init__(self, statuses):
        self.statuses = list(statuses)
        self.urls = []
        self.uploads = []

    async def post(self, url, **kwargs):
        self.urls.append(url)
        if "files" in kwargs:
            self.uploads.append(kwargs["files"]["file"][1])
        return Response(self.statuses.pop(0))


def build_prompt_tarball():
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        def add_text(name, text):
            payload = text.encode("utf-8")
            info = tarfile.TarInfo(name)
            info.mode = 0o644
            info.size = len(payload)
            tar.addfile(info, io.BytesIO(payload))

        add_text(
            "main.py",
            """import os
import time


def main():
    if True:
        conversation.run()
""",
        )
        add_text("prompt.txt", "agentcanvas what is the weather in miami nwo")
    return buffer.getvalue()


def read_prompt_tarball(data):
    entries = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar.getmembers():
            if member.isfile():
                entries[member.name] = tar.extractfile(member).read().decode("utf-8")
    return entries


async def main():
    query_client = Client([200])
    await execution._upload(
        query_client,
        "http://localhost:18000",
        "session-key",
        b"data",
        r"C:\Temp\automation.tar.gz",
    )

    fallback_client = Client([404, 200])
    await execution._upload(
        fallback_client,
        "http://localhost:18000",
        "session-key",
        b"data",
        r"C:\Temp\automation.tar.gz",
    )

    sitecustomize.os.name = "nt"
    sitecustomize._resolve_tarball_path = (
        lambda agent_url, run_id=None: r"C:\Temp\automation.tar.gz"
    )
    command_client = Client([200])
    await execution.execute_in_context(
        client=command_client,
        agent_url="http://localhost:18000",
        session_key="session-key",
        entrypoint="python automation.py",
        tarball_source=b"data",
        work_dir=r"C:\Users\me\workspace path",
        run_id="run-1",
    )
    command = execution.last_command

    prompt_client = Client([200])
    await execution.execute_in_context(
        client=prompt_client,
        agent_url="http://localhost:18000",
        session_key="session-key",
        entrypoint="python main.py",
        tarball_source=build_prompt_tarball(),
        work_dir="/workspace/automation-runs/run-2",
        timeout=120,
        run_id="run-2",
    )
    patched_prompt_entries = read_prompt_tarball(prompt_client.uploads[0])

    print(json.dumps({
        "query_urls": query_client.urls,
        "fallback_urls": fallback_client.urls,
        "command": command,
        "prompt_command": execution.last_command,
        "patched_main": patched_prompt_entries["main.py"],
        "patched_prompt": patched_prompt_entries["prompt.txt"],
    }))


asyncio.run(main())
`;

    try {
      const result = spawnSync(
        python!.command,
        [...python!.argsPrefix, "-c", script],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            OPENHANDS_AGENT_CANVAS_AUTOMATION_COMPAT: "1",
            PYTHONPATH: `${compatPythonPath}${path.delimiter}${fakeRoot}`,
          },
        },
      );

      expect(result.status, result.stderr).toBe(0);
      const output = JSON.parse(result.stdout.trim()) as {
        query_urls: string[];
        fallback_urls: string[];
        command: string;
        prompt_command: string;
        patched_main: string;
        patched_prompt: string;
      };

      expect(output.query_urls).toEqual([
        "http://localhost:18000/api/file/upload?path=C%3A%5CTemp%5Cautomation.tar.gz",
      ]);
      expect(output.fallback_urls).toEqual([
        "http://localhost:18000/api/file/upload?path=C%3A%5CTemp%5Cautomation.tar.gz",
        "http://localhost:18000/api/file/upload/C%3A%5CTemp%5Cautomation.tar.gz",
      ]);
      expect(output.command).toContain(
        "tar xzf 'C:/Temp/automation.tar.gz' -C 'C:/Users/me/workspace path'",
      );
      expect(output.command).toContain("rm -f 'C:/Temp/automation.tar.gz'");
      expect(output.command).toContain("cd 'C:/Users/me/workspace path'");
      expect(output.prompt_command).toContain(
        "export AUTOMATION_RUN_TIMEOUT_SECONDS='120'",
      );
      expect(output.prompt_command).toContain(
        "export AUTOMATION_CONVERSATION_TIMEOUT_SECONDS='60'",
      );
      expect(output.patched_main).toContain(
        "DEFAULT_AUTOMATION_CONVERSATION_TIMEOUT_SECONDS = 540",
      );
      expect(output.patched_main).toContain(
        "_run_conversation_with_timeout(conversation, timeout_seconds)",
      );
      expect(output.patched_main).not.toContain(
        "__AGENT_CANVAS_AUTOMATION_CONVERSATION_RUN_PLACEHOLDER__",
      );
      expect(output.patched_prompt).toContain("## Automation Run Contract");
      expect(output.patched_prompt).toContain(
        "agentcanvas what is the weather in miami nwo",
      );
    } finally {
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  });
});
