import { spawn } from "node:child_process";
import { once } from "node:events";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildSafeDevConfig,
  buildNpmScriptCommand,
  buildAgentServerCommand,
  formatMissingUvxGuidance,
  validateLocalAgentServerPath,
} from "../../scripts/dev-safe.mjs";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("formatMissingUvxGuidance", () => {
  it("includes install, PATH, README, and fallback workflow hints", () => {
    const guidance = formatMissingUvxGuidance(
      "/workspace/project/agent-canvas",
    );

    expect(guidance).toContain("curl -LsSf https://astral.sh/uv/install.sh | sh");
    expect(guidance).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(guidance).toContain("command -v uvx");
    expect(guidance).toContain(
      path.join("/workspace/project/agent-canvas", "README.md"),
    );
    expect(guidance).toContain(
      "https://docs.astral.sh/uv/getting-started/installation/",
    );
    expect(guidance).toContain("npm run dev:frontend");
    expect(guidance).toContain("npm run dev:mock");
  });
});

describe("buildAgentServerCommand", () => {
  it("uses released PyPI version by default with all packages pinned", () => {
    const cmd = buildAgentServerCommand({});

    expect(cmd.command).toBe("uvx");
    // Defaults to the released PyPI version with all SDK packages pinned to same version
    expect(cmd.args).toEqual([
      "--from",
      "openhands-agent-server==1.21.1",
      "--with",
      "openhands-tools==1.21.1",
      "--with",
      "openhands-workspace==1.21.1",
      "agent-server",
    ]);
    expect(cmd.source).toBe("PyPI (1.21.1, default)");
  });

  it("uses specific PyPI version when OH_AGENT_SERVER_VERSION is set with all packages pinned", () => {
    const cmd = buildAgentServerCommand({ OH_AGENT_SERVER_VERSION: "1.18.0" });

    expect(cmd.command).toBe("uvx");
    // Uses --from syntax because executable name (agent-server) differs from package name (openhands-agent-server)
    // All SDK packages are pinned to the same version
    expect(cmd.args).toEqual([
      "--from",
      "openhands-agent-server==1.18.0",
      "--with",
      "openhands-tools==1.18.0",
      "--with",
      "openhands-workspace==1.18.0",
      "agent-server",
    ]);
    expect(cmd.source).toBe("PyPI (1.18.0)");
  });

  it("uses git ref with subdirectory syntax for monorepo", () => {
    const cmd = buildAgentServerCommand({ OH_AGENT_SERVER_GIT_REF: "feature-branch" });

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toEqual([
      "--from",
      "git+https://github.com/OpenHands/software-agent-sdk@feature-branch#subdirectory=openhands-agent-server",
      "--with",
      "git+https://github.com/OpenHands/software-agent-sdk@feature-branch#subdirectory=openhands-tools",
      "--with",
      "git+https://github.com/OpenHands/software-agent-sdk@feature-branch#subdirectory=openhands-workspace",
      "agent-server",
    ]);
    expect(cmd.source).toBe("git (feature-branch)");
  });

  it("uses git ref for commit SHA", () => {
    const cmd = buildAgentServerCommand({ OH_AGENT_SERVER_GIT_REF: "abc1234" });

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toEqual([
      "--from",
      "git+https://github.com/OpenHands/software-agent-sdk@abc1234#subdirectory=openhands-agent-server",
      "--with",
      "git+https://github.com/OpenHands/software-agent-sdk@abc1234#subdirectory=openhands-tools",
      "--with",
      "git+https://github.com/OpenHands/software-agent-sdk@abc1234#subdirectory=openhands-workspace",
      "agent-server",
    ]);
    expect(cmd.source).toBe("git (abc1234)");
  });

  it("git ref takes precedence over version", () => {
    const cmd = buildAgentServerCommand({
      OH_AGENT_SERVER_VERSION: "1.18.0",
      OH_AGENT_SERVER_GIT_REF: "feature-branch",
    });

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toContain("--from");
    expect(cmd.args).toContain(
      "git+https://github.com/OpenHands/software-agent-sdk@feature-branch#subdirectory=openhands-agent-server",
    );
    expect(cmd.args).not.toContain("openhands-agent-server==1.18.0");
  });

  it("uses local path with editable workspace packages when OH_AGENT_SERVER_LOCAL_PATH is set", () => {
    const sdk = "/abs/path/to/software-agent-sdk";
    const cmd = buildAgentServerCommand({ OH_AGENT_SERVER_LOCAL_PATH: sdk });

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toEqual([
      "--reinstall",
      "--from",
      path.join(sdk, "openhands-agent-server"),
      "--with-editable",
      path.join(sdk, "openhands-sdk"),
      "--with-editable",
      path.join(sdk, "openhands-tools"),
      "--with-editable",
      path.join(sdk, "openhands-workspace"),
      "agent-server",
    ]);
    expect(cmd.source).toBe(`local (${sdk})`);
  });

  it("local path takes precedence over git ref and version", () => {
    const sdk = "/abs/path/to/software-agent-sdk";
    const cmd = buildAgentServerCommand({
      OH_AGENT_SERVER_LOCAL_PATH: sdk,
      OH_AGENT_SERVER_GIT_REF: "feature-branch",
      OH_AGENT_SERVER_VERSION: "1.18.0",
    });

    expect(cmd.source).toBe(`local (${sdk})`);
    expect(cmd.args).toContain(path.join(sdk, "openhands-agent-server"));
    expect(cmd.args).not.toContain(
      "git+https://github.com/OpenHands/software-agent-sdk@feature-branch#subdirectory=openhands-agent-server",
    );
    expect(cmd.args).not.toContain("openhands-agent-server==1.18.0");
  });

  it("rejects relative OH_AGENT_SERVER_LOCAL_PATH", () => {
    expect(() =>
      buildAgentServerCommand({
        OH_AGENT_SERVER_LOCAL_PATH: "./software-agent-sdk",
      }),
    ).toThrow(/must be an absolute path/);
  });
});

describe("validateLocalAgentServerPath", () => {
  it("passes when all four workspace packages exist", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "sdk-"));
    try {
      for (const subdir of [
        "openhands-agent-server",
        "openhands-sdk",
        "openhands-tools",
        "openhands-workspace",
      ]) {
        mkdirSync(path.join(tmp, subdir));
      }
      expect(() => validateLocalAgentServerPath(tmp)).not.toThrow();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("throws when the path does not exist", () => {
    expect(() =>
      validateLocalAgentServerPath("/definitely/does/not/exist/sdk"),
    ).toThrow(/does not exist/);
  });

  it("throws when a workspace package subdirectory is missing", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "sdk-"));
    try {
      mkdirSync(path.join(tmp, "openhands-agent-server"));
      mkdirSync(path.join(tmp, "openhands-sdk"));
      mkdirSync(path.join(tmp, "openhands-tools"));
      // openhands-workspace is intentionally absent
      expect(() => validateLocalAgentServerPath(tmp)).toThrow(
        /openhands-workspace/,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("throws when given a relative path", () => {
    expect(() => validateLocalAgentServerPath("./sdk")).toThrow(
      /must be an absolute path/,
    );
  });
});

describe("buildSafeDevConfig", () => {
  it("builds isolated default paths and ports", () => {
    const cwd = "/workspace/project/agent-canvas";

    const config = buildSafeDevConfig(cwd, {});

    expect(config.backendPort).toBe(18000);
    expect(config.vscodePort).toBe(18001);
    expect(config.backendBaseUrl).toBe("http://127.0.0.1:18000");
    expect(config.backendHost).toBe("127.0.0.1:18000");
    expect(config.workingDir).toBe(config.workspacesPath);
    expect(config.stateDir).toBe(
      path.join(homedir(), ".openhands", "agent-canvas"),
    );
    expect(config.tmuxTmpDir).toBe(path.join(config.stateDir, "tmux"));
    expect(config.conversationsPath).toBe(
      path.join(config.stateDir, "conversations"),
    );
    expect(config.workspacesPath).toBe(
      path.join(config.stateDir, "workspaces"),
    );
    expect(config.bashEventsDir).toBe(
      path.join(config.stateDir, "bash_events"),
    );
  });

  it("honors environment overrides", () => {
    const cwd = "/workspace/project/agent-canvas";

    const config = buildSafeDevConfig(cwd, {
      OH_CANVAS_SAFE_BACKEND_PORT: "19000",
      OH_CANVAS_SAFE_VSCODE_PORT: "19010",
      OH_CANVAS_SAFE_STATE_DIR: ".tmp/dev-safe",
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
  it("exits promptly when uvx is missing", async () => {
    // Skip this test if uvx is globally installed via /usr/local/bin symlink
    // that may still be accessible even with a stripped PATH
    const child = spawn(process.execPath, ["scripts/dev-safe.mjs"], {
      cwd: repoRoot,
      env: {
        // Use empty PATH to ensure uvx is not found
        PATH: "",
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
    expect(output).toContain("Failed to start uvx");
    expect(output).toContain("curl -LsSf https://astral.sh/uv/install.sh | sh");
    expect(output).toContain(
      "https://docs.astral.sh/uv/getting-started/installation/",
    );
    expect(output).toContain("README.md");
    expect(output).toContain("npm run dev:mock");
    expect(output).toContain("spawn uvx ENOENT");
  });
});
