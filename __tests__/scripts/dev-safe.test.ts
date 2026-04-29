import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildSafeDevConfig,
  buildNpmScriptCommand,
  formatMissingAgentServerGuidance,
} from "../../scripts/dev-safe.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);


describe("formatMissingAgentServerGuidance", () => {
  it("includes install, PATH, README, and fallback workflow hints", () => {
    const guidance = formatMissingAgentServerGuidance(
      "/workspace/project/agent-server-gui",
    );

    expect(guidance).toContain(
      "uv tool install -U --with openhands-tools --with openhands-workspace openhands-agent-server",
    );
    expect(guidance).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(guidance).toContain(
      path.join("/workspace/project/agent-server-gui", "README.md"),
    );
    expect(guidance).toContain(
      "https://docs.astral.sh/uv/getting-started/installation/",
    );
    expect(guidance).toContain("npm run dev:frontend");
    expect(guidance).toContain("npm run dev:mock");
  });
});

describe("buildSafeDevConfig", () => {
  it("builds isolated default paths and ports", () => {
    const cwd = "/workspace/project/agent-server-gui";

    const config = buildSafeDevConfig(cwd, {});

    expect(config.backendPort).toBe(18000);
    expect(config.vscodePort).toBe(18001);
    expect(config.backendBaseUrl).toBe("http://127.0.0.1:18000");
    expect(config.backendHost).toBe("127.0.0.1:18000");
    expect(config.workingDir).toBe(cwd);
    expect(config.stateDir).toBe(
      path.resolve(cwd, ".openhands-dev", "safe-dev-18000"),
    );
    expect(config.tmuxTmpDir).toBe(path.join(config.stateDir, "tmux"));
    expect(config.conversationsPath).toBe(
      path.join(config.stateDir, "conversations"),
    );
    expect(config.bashEventsDir).toBe(
      path.join(config.stateDir, "bash_events"),
    );
  });

  it("honors environment overrides", () => {
    const cwd = "/workspace/project/agent-server-gui";

    const config = buildSafeDevConfig(cwd, {
      OH_GUI_SAFE_BACKEND_PORT: "19000",
      OH_GUI_SAFE_VSCODE_PORT: "19010",
      OH_GUI_SAFE_STATE_DIR: ".tmp/dev-safe",
      VITE_WORKING_DIR: "/workspace/custom-repo",
    });

    expect(config.backendPort).toBe(19000);
    expect(config.vscodePort).toBe(19010);
    expect(config.backendBaseUrl).toBe("http://127.0.0.1:19000");
    expect(config.backendHost).toBe("127.0.0.1:19000");
    expect(config.stateDir).toBe(path.resolve(cwd, ".tmp", "dev-safe"));
    expect(config.workingDir).toBe("/workspace/custom-repo");
  });
});

describe("buildNpmScriptCommand", () => {
  it("reuses npm's own CLI path when available", () => {
    const command = buildNpmScriptCommand(
      "dev:frontend",
      "win32",
      {
        npm_execpath: "C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
        npm_node_execpath: "C:\\nodejs\\node.exe",
      },
      "C:\\fallback\\node.exe",
    );

    expect(command).toEqual({
      command: "C:\\nodejs\\node.exe",
      args: [
        "C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
        "run",
        "dev:frontend",
      ],
    });
  });

  it("runs npm directly on POSIX platforms", () => {
    const command = buildNpmScriptCommand("dev:frontend", "linux", {});

    expect(command).toEqual({
      command: "npm",
      args: ["run", "dev:frontend"],
    });
  });

  it("runs npm through cmd.exe on Windows", () => {
    const command = buildNpmScriptCommand("dev:frontend", "win32", {
      ComSpec: "C:\\Windows\\System32\\cmd.exe",
    });

    expect(command).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "npm", "run", "dev:frontend"],
    });
  });

  it("falls back to cmd.exe when ComSpec is unavailable on Windows", () => {
    const command = buildNpmScriptCommand("dev:frontend", "win32", {});

    expect(command).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm", "run", "dev:frontend"],
    });
  });
});

describe("dev-safe CLI startup", () => {
  it("exits promptly when agent-server is missing", async () => {
    const child = spawn(process.execPath, ["scripts/dev-safe.mjs"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: "/usr/bin:/bin",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    const exitResult = await Promise.race([
      once(child, "exit").then(([code, signal]) => ({
        code,
        signal,
        timedOut: false,
      })),
      delay(4_000).then(() => ({ code: null, signal: null, timedOut: true })),
    ]);

    if (exitResult.timedOut) {
      child.kill("SIGKILL");
    }

    expect(exitResult.timedOut).toBe(false);
    expect(exitResult.code).toBe(1);
    expect(output).toContain("Failed to start agent-server");
    expect(output).toContain(
      "uv tool install -U --with openhands-tools --with openhands-workspace openhands-agent-server",
    );
    expect(output).toContain(
      "https://docs.astral.sh/uv/getting-started/installation/",
    );
    expect(output).toContain("README.md");
    expect(output).toContain("npm run dev:mock");
    expect(output).toContain("spawn agent-server ENOENT");
  });
});
