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
} from "../../scripts/dev-safe.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("formatMissingUvxGuidance", () => {
  it("includes install, PATH, README, and fallback workflow hints", () => {
    const guidance = formatMissingUvxGuidance(
      "/workspace/project/agent-server-gui",
    );

    expect(guidance).toContain("curl -LsSf https://astral.sh/uv/install.sh | sh");
    expect(guidance).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(guidance).toContain("command -v uvx");
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

describe("buildAgentServerCommand", () => {
  it("uses main branch by default (until settings APIs are released)", () => {
    const cmd = buildAgentServerCommand({});

    expect(cmd.command).toBe("uvx");
    // Currently defaults to main branch due to unreleased settings persistence APIs
    expect(cmd.args).toEqual([
      "--from",
      "git+https://github.com/OpenHands/software-agent-sdk@main#subdirectory=openhands-agent-server",
      "--with",
      "git+https://github.com/OpenHands/software-agent-sdk@main#subdirectory=openhands-tools",
      "--with",
      "git+https://github.com/OpenHands/software-agent-sdk@main#subdirectory=openhands-workspace",
      "agent-server",
    ]);
    expect(cmd.source).toBe("git (main, default)");
  });

  it("uses specific PyPI version when OH_AGENT_SERVER_VERSION is set", () => {
    const cmd = buildAgentServerCommand({ OH_AGENT_SERVER_VERSION: "1.18.0" });

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toEqual([
      "--with",
      "openhands-tools",
      "--with",
      "openhands-workspace",
      "openhands-agent-server==1.18.0",
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
});

describe("buildSafeDevConfig", () => {
  it("builds isolated default paths and ports", () => {
    const cwd = "/workspace/project/agent-server-gui";

    const config = buildSafeDevConfig(cwd, {});

    expect(config.backendPort).toBe(18000);
    expect(config.vscodePort).toBe(18001);
    expect(config.backendBaseUrl).toBe("http://127.0.0.1:18000");
    expect(config.backendHost).toBe("127.0.0.1:18000");
    expect(config.workingDir).toBe(config.workspacesPath);
    expect(config.stateDir).toBe(
      path.join(homedir(), ".openhands", "agent-server-gui"),
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
