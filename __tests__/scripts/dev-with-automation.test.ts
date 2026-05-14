import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it, afterEach } from "vitest";
import {
  buildAutomationCommand,
  buildConfig,
  DEFAULT_AUTOMATION_REPO,
  DEFAULT_AUTOMATION_PACKAGE,
  DEFAULT_AUTOMATION_VERSION,
  DEFAULT_BACKEND_PORT,
  DEFAULT_AUTOMATION_PORT,
} from "../../scripts/dev-with-automation.mjs";
import { resetPersistedSessionApiKeyCache } from "../../scripts/dev-safe.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("buildAutomationCommand", () => {
  it("uses released PyPI version by default", () => {
    const cmd = buildAutomationCommand({});

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toContain("--from");
    expect(cmd.args).toContain(
      `${DEFAULT_AUTOMATION_PACKAGE}==${DEFAULT_AUTOMATION_VERSION}`,
    );
    expect(cmd.args).toContain("uvicorn");
    expect(cmd.args).toContain("openhands.automation.app:app");
    expect(cmd.source).toBe(`PyPI (${DEFAULT_AUTOMATION_VERSION}, default)`);
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

  it("uses custom repo with git ref", () => {
    const cmd = buildAutomationCommand({
      OH_AUTOMATION_REPO: "https://github.com/MyOrg/my-automation",
      OH_AUTOMATION_GIT_REF: "main",
    });

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toContain(
      "git+https://github.com/MyOrg/my-automation@main",
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

  it("uses specific PyPI version when OH_AUTOMATION_VERSION is set", () => {
    const cmd = buildAutomationCommand({
      OH_AUTOMATION_VERSION: "1.0.0",
    });

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toContain(
      `${DEFAULT_AUTOMATION_PACKAGE}==1.0.0`,
    );
    expect(cmd.source).toBe("PyPI (1.0.0)");
  });

  it("git ref takes precedence over version", () => {
    const cmd = buildAutomationCommand({
      OH_AUTOMATION_GIT_REF: "main",
      OH_AUTOMATION_VERSION: "1.0.0",
    });

    expect(cmd.command).toBe("uvx");
    expect(cmd.args).toContain(
      `git+${DEFAULT_AUTOMATION_REPO}@main`,
    );
    expect(cmd.args).not.toContain(`${DEFAULT_AUTOMATION_PACKAGE}==1.0.0`);
    expect(cmd.source).toBe("git (main)");
  });
});

describe("buildConfig", () => {
  const servers: net.Server[] = [];
  const keyDirs: string[] = [];

  afterEach(() => {
    for (const server of servers) {
      server.close();
    }
    servers.length = 0;
    while (keyDirs.length > 0) {
      const dir = keyDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
    resetPersistedSessionApiKeyCache();
  });

  /**
   * Build an env that points the persisted session-api-key file at a
   * fresh temp dir, so tests don't write to the user's real
   * ~/.openhands/agent-canvas/session-api-key.txt.
   */
  function envWithIsolatedKeyPath(
    extra: Record<string, string> = {},
  ): Record<string, string> {
    const dir = mkdtempSync(path.join(tmpdir(), "buildconfig-key-"));
    keyDirs.push(dir);
    return {
      OH_SESSION_API_KEY_PATH: path.join(dir, "session-api-key.txt"),
      ...extra,
    };
  }

  it("builds default config with correct ports", async () => {
    const config = await buildConfig({}, envWithIsolatedKeyPath());

    // Ports should be allocated (either defaults if free, or alternatives)
    expect(typeof config.ingressPort).toBe("number");
    expect(config.ingressPort).toBeGreaterThan(0);
    expect(typeof config.agentServerPort).toBe("number");
    expect(config.agentServerPort).toBeGreaterThan(0);
    expect(typeof config.autoBackendPort).toBe("number");
    expect(config.autoBackendPort).toBeGreaterThan(0);
    expect(typeof config.vitePort).toBe("number");
    expect(config.vitePort).toBeGreaterThan(0);
    expect(config.vscodePort).toBe(config.agentServerPort + 1000);

    // All four main ports should be unique
    const ports = new Set([
      config.ingressPort,
      config.agentServerPort,
      config.autoBackendPort,
      config.vitePort,
    ]);
    expect(ports.size).toBe(4);
  });

  it("respects preferred port from args when available", async () => {
    // Use a high port unlikely to be busy
    const preferredPort = 19500;
    const config = await buildConfig(
      { port: preferredPort },
      envWithIsolatedKeyPath(),
    );

    expect(config.ingressPort).toBe(preferredPort);
  });

  it("falls back to alternative port when ingress port is busy", async () => {
    const busyPort = 8100;

    // Block port 8100
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.listen(busyPort, "127.0.0.1", () => {
        servers.push(server);
        resolve();
      });
      server.on("error", reject);
    });

    // Request the busy port
    const config = await buildConfig(
      { port: busyPort },
      envWithIsolatedKeyPath(),
    );

    // Should get a different port since busyPort is taken
    expect(config.ingressPort).not.toBe(busyPort);
    expect(config.ingressPort).toBeGreaterThan(0);
  });

  it("allocates valid ports for all services", async () => {
    const config = await buildConfig({}, envWithIsolatedKeyPath());

    // All service ports should be valid
    expect(config.agentServerPort).toBeGreaterThan(0);
    expect(config.autoBackendPort).toBeGreaterThan(0);
    expect(config.vitePort).toBeGreaterThan(0);
    expect(config.vscodePort).toBeGreaterThan(0);

    // All service ports should be different from each other
    const servicePorts = [
      config.agentServerPort,
      config.autoBackendPort,
      config.vitePort,
      config.ingressPort,
    ];
    expect(new Set(servicePorts).size).toBe(servicePorts.length);
  });

  it("respects preferred PORT from env when available", async () => {
    // Use a high port unlikely to be busy
    const preferredPort = "19501";
    const config = await buildConfig(
      {},
      envWithIsolatedKeyPath({ PORT: preferredPort }),
    );

    expect(config.ingressPort).toBe(19501);
  });

  it("args.port takes precedence over env.PORT", async () => {
    // Use high ports unlikely to be busy
    const config = await buildConfig(
      { port: 19502 },
      envWithIsolatedKeyPath({ PORT: "19599" }),
    );

    expect(config.ingressPort).toBe(19502);
  });

  it("applies automationGitRef from args to env", async () => {
    const env = envWithIsolatedKeyPath();
    await buildConfig({ automationGitRef: "my-branch" }, env);

    expect(env.OH_AUTOMATION_GIT_REF).toBe("my-branch");
  });

  it("applies automationRepo from args to env", async () => {
    const env = envWithIsolatedKeyPath();
    await buildConfig({ automationRepo: "https://example.com/repo" }, env);

    expect(env.OH_AUTOMATION_REPO).toBe("https://example.com/repo");
  });

  it("uses correct state directory path", async () => {
    const config = await buildConfig({}, envWithIsolatedKeyPath());

    expect(config.stateDir).toBe(
      path.join(homedir(), ".openhands", "agent-canvas"),
    );
  });

  it("passes verbose flag through", async () => {
    const config = await buildConfig({ verbose: true }, envWithIsolatedKeyPath());

    expect(config.verbose).toBe(true);
  });

  it("auto-generates random local API key by default", async () => {
    const config = await buildConfig({}, envWithIsolatedKeyPath());

    // Default is a 64-char hex string (256-bit random key)
    expect(config.localApiKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("respects custom AUTOMATION_LOCAL_API_KEY from env", async () => {
    const config = await buildConfig(
      {},
      envWithIsolatedKeyPath({ AUTOMATION_LOCAL_API_KEY: "my-custom-key" }),
    );

    expect(config.localApiKey).toBe("my-custom-key");
  });

  it("falls back to a freshly persisted session API key by default", async () => {
    const config = await buildConfig({}, envWithIsolatedKeyPath());

    // Default is a 64-char hex string (256-bit random key) read from /
    // written to OH_SESSION_API_KEY_PATH.
    expect(config.sessionApiKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reuses the persisted session API key across calls (parity for dev:docker and dev:dangerously-dockerless restarts)", async () => {
    const env = envWithIsolatedKeyPath();
    const first = await buildConfig({}, env);

    // Simulate a fresh process invocation (the file on disk should be
    // what makes the key stable).
    resetPersistedSessionApiKeyCache();

    const second = await buildConfig({}, env);

    expect(second.sessionApiKey).toBe(first.sessionApiKey);
  });

  it("reads sessionApiKey from SESSION_API_KEY", async () => {
    const config = await buildConfig({}, { SESSION_API_KEY: "my-session-key" });

    expect(config.sessionApiKey).toBe("my-session-key");
  });

  it("reads sessionApiKey from VITE_SESSION_API_KEY as fallback", async () => {
    const config = await buildConfig({}, { VITE_SESSION_API_KEY: "vite-session-key" });

    expect(config.sessionApiKey).toBe("vite-session-key");
  });

  it("SESSION_API_KEY takes precedence over VITE_SESSION_API_KEY", async () => {
    const config = await buildConfig({}, {
      SESSION_API_KEY: "session-key",
      VITE_SESSION_API_KEY: "vite-key",
    });

    expect(config.sessionApiKey).toBe("session-key");
  });

  it("reads sessionApiKey from OH_SESSION_API_KEYS_0 (agent-server V1 env)", async () => {
    const config = await buildConfig({}, { OH_SESSION_API_KEYS_0: "v1-session-key" });

    expect(config.sessionApiKey).toBe("v1-session-key");
  });

  it("SESSION_API_KEY takes precedence over OH_SESSION_API_KEYS_0", async () => {
    const config = await buildConfig({}, {
      SESSION_API_KEY: "v0-key",
      OH_SESSION_API_KEYS_0: "v1-key",
    });

    expect(config.sessionApiKey).toBe("v0-key");
  });

  it("SESSION_API_KEY takes precedence over all other session key env vars", async () => {
    const config = await buildConfig({}, {
      SESSION_API_KEY: "v0-key",
      OH_SESSION_API_KEYS_0: "v1-key",
      VITE_SESSION_API_KEY: "vite-key",
    });

    expect(config.sessionApiKey).toBe("v0-key");
  });
});

describe("default constants", () => {
  it("has expected default automation repo", () => {
    expect(DEFAULT_AUTOMATION_REPO).toBe(
      "https://github.com/OpenHands/automation",
    );
  });

  it("has expected default automation package", () => {
    expect(DEFAULT_AUTOMATION_PACKAGE).toBe("openhands-automation");
  });

  it("has expected default automation version", () => {
    expect(DEFAULT_AUTOMATION_VERSION).toBe("1.0.0a2");
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
    expect(output).toContain("--static");
    expect(output).toContain("--dynamic");
    expect(output).toContain("OH_AUTOMATION_GIT_REF");
    expect(output).toContain("AUTOMATION_LOCAL_API_KEY");
    expect(output).toContain("OPENHANDS_AUTOMATION_API_KEY");
    expect(output).toContain("SECRETS:");
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
