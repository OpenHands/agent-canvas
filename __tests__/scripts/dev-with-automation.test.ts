import { spawn } from "node:child_process";
import { once } from "node:events";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildAutomationCommand,
  buildConfig,
  DEFAULT_AUTOMATION_REPO,
  DEFAULT_AUTOMATION_GIT_REF,
  DEFAULT_BACKEND_PORT,
  DEFAULT_AUTOMATION_PORT,
} from "../../scripts/dev-with-automation.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("buildAutomationCommand", () => {
  it("uses main branch by default", () => {
    const cmd = buildAutomationCommand({});

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toContain("--from");
    expect(cmd.args).toContain(
      `git+${DEFAULT_AUTOMATION_REPO}@${DEFAULT_AUTOMATION_GIT_REF}`,
    );
    expect(cmd.args).toContain("uvicorn");
    expect(cmd.args).toContain("automation.app:app");
    expect(cmd.source).toBe(`git (${DEFAULT_AUTOMATION_GIT_REF})`);
  });

  it("uses custom git ref from OH_AUTOMATION_GIT_REF", () => {
    const cmd = buildAutomationCommand({
      OH_AUTOMATION_GIT_REF: "feat/my-feature",
    });

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toContain("--from");
    expect(cmd.args).toContain(
      `git+${DEFAULT_AUTOMATION_REPO}@feat/my-feature`,
    );
    expect(cmd.source).toBe("git (feat/my-feature)");
  });

  it("uses custom repo from OH_AUTOMATION_REPO", () => {
    const cmd = buildAutomationCommand({
      OH_AUTOMATION_REPO: "https://github.com/MyOrg/my-automation",
    });

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toContain(
      `git+https://github.com/MyOrg/my-automation@${DEFAULT_AUTOMATION_GIT_REF}`,
    );
  });

  it("uses both custom repo and ref together", () => {
    const cmd = buildAutomationCommand({
      OH_AUTOMATION_REPO: "https://github.com/MyOrg/my-automation",
      OH_AUTOMATION_GIT_REF: "v1.0.0",
    });

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toContain(
      "git+https://github.com/MyOrg/my-automation@v1.0.0",
    );
    expect(cmd.source).toBe("git (v1.0.0)");
  });

  it("supports commit SHA as git ref", () => {
    const cmd = buildAutomationCommand({
      OH_AUTOMATION_GIT_REF: "abc123def456",
    });

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toContain(
      `git+${DEFAULT_AUTOMATION_REPO}@abc123def456`,
    );
    expect(cmd.source).toBe("git (abc123def456)");
  });
});

describe("buildConfig", () => {
  it("builds default config with correct ports", () => {
    const config = buildConfig({}, {});

    expect(config.ingressPort).toBe(8000);
    expect(config.agentServerPort).toBe(DEFAULT_BACKEND_PORT);
    expect(config.autoBackendPort).toBe(DEFAULT_AUTOMATION_PORT);
    expect(config.vitePort).toBe(3001);
    expect(config.vscodePort).toBe(DEFAULT_BACKEND_PORT + 1000);
  });

  it("respects port from args", () => {
    const config = buildConfig({ port: 9000 }, {});

    expect(config.ingressPort).toBe(9000);
  });

  it("respects PORT from env", () => {
    const config = buildConfig({}, { PORT: "9001" });

    expect(config.ingressPort).toBe(9001);
  });

  it("args.port takes precedence over env.PORT", () => {
    const config = buildConfig({ port: 9002 }, { PORT: "9999" });

    expect(config.ingressPort).toBe(9002);
  });

  it("applies automationGitRef from args to env", () => {
    const env: Record<string, string> = {};
    buildConfig({ automationGitRef: "my-branch" }, env);

    expect(env.OH_AUTOMATION_GIT_REF).toBe("my-branch");
  });

  it("applies automationRepo from args to env", () => {
    const env: Record<string, string> = {};
    buildConfig({ automationRepo: "https://example.com/repo" }, env);

    expect(env.OH_AUTOMATION_REPO).toBe("https://example.com/repo");
  });

  it("uses correct state directory path", () => {
    const config = buildConfig({}, {});

    expect(config.stateDir).toBe(
      path.join(homedir(), ".openhands", "agent-canvas"),
    );
  });

  it("passes verbose flag through", () => {
    const config = buildConfig({ verbose: true }, {});

    expect(config.verbose).toBe(true);
  });
});

describe("default constants", () => {
  it("has expected default automation repo", () => {
    expect(DEFAULT_AUTOMATION_REPO).toBe(
      "https://github.com/OpenHands/automation",
    );
  });

  it("has expected default automation git ref", () => {
    expect(DEFAULT_AUTOMATION_GIT_REF).toBe("main");
  });

  it("has expected default backend port", () => {
    expect(DEFAULT_BACKEND_PORT).toBe(18000);
  });

  it("has expected default automation port", () => {
    expect(DEFAULT_AUTOMATION_PORT).toBe(18001);
  });
});

describe("dev-with-automation CLI", () => {
  it("shows help with --help flag", async () => {
    const child = spawn(
      process.execPath,
      ["scripts/dev-with-automation.mjs", "--help"],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    const [code] = await once(child, "exit");

    expect(code).toBe(0);
    expect(output).toContain("Agent Canvas + Automation Development Stack");
    expect(output).toContain("--port");
    expect(output).toContain("--automation-ref");
    expect(output).toContain("--automation-repo");
    expect(output).toContain("OH_AUTOMATION_GIT_REF");
  });

  it("exits promptly when uvx is missing", async () => {
    const child = spawn(
      process.execPath,
      ["scripts/dev-with-automation.mjs"],
      {
        cwd: repoRoot,
        env: {
          PATH: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

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
    expect(output).toContain("uvx");
  });
});
