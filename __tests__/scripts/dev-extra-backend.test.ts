import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExtraBackendConfig } from "../../scripts/dev-extra-backend.mjs";
import { buildSafeDevConfig } from "../../scripts/dev-server.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("buildExtraBackendConfig", () => {
  it("defaults to ports 18002/18003 distinct from the bundled instance", () => {
    const bundled = buildSafeDevConfig(repoRoot, {});
    const extra = buildExtraBackendConfig(repoRoot, {});

    expect(extra.backendPort).toBe(18002);
    expect(extra.vscodePort).toBe(18003);
    expect(extra.backendBaseUrl).toBe("http://127.0.0.1:18002");
    expect(extra.backendHost).toBe("127.0.0.1:18002");
    expect(extra.backendPort).not.toBe(bundled.backendPort);
    expect(extra.vscodePort).not.toBe(bundled.vscodePort);
  });

  it("honors OH_CANVAS_EXTRA_BACKEND_PORT and OH_CANVAS_EXTRA_VSCODE_PORT", () => {
    const config = buildExtraBackendConfig(repoRoot, {
      OH_CANVAS_EXTRA_BACKEND_PORT: "29000",
      OH_CANVAS_EXTRA_VSCODE_PORT: "29001",
    });

    expect(config.backendPort).toBe(29000);
    expect(config.vscodePort).toBe(29001);
    expect(config.backendBaseUrl).toBe("http://127.0.0.1:29000");
  });

  it("shares state dir, conversations, bash events, and secret key with the bundled config", () => {
    const env = { OH_CANVAS_SAFE_STATE_DIR: "/tmp/canvas-state" };
    const bundled = buildSafeDevConfig(repoRoot, env);
    const extra = buildExtraBackendConfig(repoRoot, env);

    expect(extra.stateDir).toBe(bundled.stateDir);
    expect(extra.conversationsPath).toBe(bundled.conversationsPath);
    expect(extra.bashEventsDir).toBe(bundled.bashEventsDir);
    expect(extra.tmuxTmpDir).toBe(bundled.tmuxTmpDir);
    expect(extra.secretKey).toBe(bundled.secretKey);
  });

  it("rejects an invalid OH_CANVAS_EXTRA_BACKEND_PORT", () => {
    expect(() =>
      buildExtraBackendConfig(repoRoot, {
        OH_CANVAS_EXTRA_BACKEND_PORT: "not-a-port",
      }),
    ).toThrow(/Invalid port/);
  });
});
