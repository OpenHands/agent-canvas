// @vitest-environment node
import { createServer, type Server } from "node:http";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  lutimesSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-ignore - Node-only ESM handler used directly by dev servers.
import {
  __getSetupBackendsAuthRateLimitSizeForTests,
  __resetSetupBackendsAuthRateLimitForTests,
  getAgentCanvasBackendFilePath,
  handleSetupBackendsRequest,
  SETUP_BACKENDS_ENDPOINT,
} from "../../scripts/setup_server/endpoints/backend-credentials.mjs";

let server: Server | null = null;
let tempDir: string | null = null;
const originalPersistenceDir = process.env.OPENHANDS_PERSISTENCE_DIR;
const originalSessionApiKey = process.env.VITE_SESSION_API_KEY;
const originalSetupServerTrustProxy = process.env.SETUP_SERVER_TRUST_PROXY;
const originalSetupServerTrustedProxyIps =
  process.env.SETUP_SERVER_TRUSTED_PROXY_IPS;
const originalGlobalAuthRateLimit =
  process.env.SETUP_SERVER_AUTH_RATE_LIMIT_GLOBAL_MAX_FAILURES;
const originalGlobalRequestRateLimit =
  process.env.SETUP_SERVER_REQUEST_RATE_LIMIT_GLOBAL_MAX_REQUESTS;

const cloudCredentialPayload = {
  id: "cloud",
  name: "Cloud",
  host: "https://app.all-hands.dev",
  kind: "cloud",
  api_key: "oh-key",
};

function getCurrentProcessStartTokenForTests() {
  const stat = readFileSync(`/proc/${process.pid}/stat`, "utf8");
  const fieldsStart = stat.lastIndexOf(") ");
  if (fieldsStart === -1) {
    throw new Error("Could not parse current process stat");
  }
  const startToken = stat
    .slice(fieldsStart + 2)
    .trim()
    .split(/\s+/)[19];
  return `linux:${startToken}`;
}

async function importEndpointWithFsMock(fsOverrides: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    return {
      ...actual,
      ...fsOverrides,
    };
  });

  try {
    // @ts-ignore - Node-only ESM handler used directly by dev servers.
    return await import("../../scripts/setup_server/endpoints/backend-credentials.mjs");
  } finally {
    vi.doUnmock("node:fs");
  }
}

async function startTestServer() {
  server = createServer((req, res) => {
    handleSetupBackendsRequest(req, res).then((handled) => {
      if (!handled) {
        res.writeHead(404);
        res.end("not found");
      }
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start test server");
  }
  return `http://127.0.0.1:${address.port}`;
}

function trustLocalProxyForTests() {
  process.env.SETUP_SERVER_TRUST_PROXY = "true";
  process.env.SETUP_SERVER_TRUSTED_PROXY_IPS = "127.0.0.1,::1";
}

describe("setup backend credentials endpoint", () => {
  afterEach(async () => {
    __resetSetupBackendsAuthRateLimitForTests();
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    if (originalPersistenceDir === undefined) {
      delete process.env.OPENHANDS_PERSISTENCE_DIR;
    } else {
      process.env.OPENHANDS_PERSISTENCE_DIR = originalPersistenceDir;
    }
    if (originalSessionApiKey === undefined) {
      delete process.env.VITE_SESSION_API_KEY;
    } else {
      process.env.VITE_SESSION_API_KEY = originalSessionApiKey;
    }
    if (originalSetupServerTrustProxy === undefined) {
      delete process.env.SETUP_SERVER_TRUST_PROXY;
    } else {
      process.env.SETUP_SERVER_TRUST_PROXY = originalSetupServerTrustProxy;
    }
    if (originalSetupServerTrustedProxyIps === undefined) {
      delete process.env.SETUP_SERVER_TRUSTED_PROXY_IPS;
    } else {
      process.env.SETUP_SERVER_TRUSTED_PROXY_IPS =
        originalSetupServerTrustedProxyIps;
    }
    if (originalGlobalAuthRateLimit === undefined) {
      delete process.env.SETUP_SERVER_AUTH_RATE_LIMIT_GLOBAL_MAX_FAILURES;
    } else {
      process.env.SETUP_SERVER_AUTH_RATE_LIMIT_GLOBAL_MAX_FAILURES =
        originalGlobalAuthRateLimit;
    }
    if (originalGlobalRequestRateLimit === undefined) {
      delete process.env.SETUP_SERVER_REQUEST_RATE_LIMIT_GLOBAL_MAX_REQUESTS;
    } else {
      process.env.SETUP_SERVER_REQUEST_RATE_LIMIT_GLOBAL_MAX_REQUESTS =
        originalGlobalRequestRateLimit;
    }
    vi.doUnmock("node:fs");
    vi.restoreAllMocks();
  });

  it("persists and returns per-backend Cloud credentials", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const unauthorized = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`);
    expect(unauthorized.status).toBe(401);

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "cloud:prod",
        name: "Production Cloud",
        host: "https://app.all-hands.dev/",
        kind: "cloud",
        api_key: "oh-key",
      }),
    });
    expect(saveResponse.ok).toBe(true);
    await expect(saveResponse.json()).resolves.toMatchObject({
      backend: {
        id: "cloud:prod",
        name: "Production Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "oh-key",
      },
    });

    const backendFilePath = getAgentCanvasBackendFilePath("cloud:prod");
    expect(backendFilePath).toBe(
      path.join(tempDir, "agent-canvas", "backends", "cloud%3Aprod.json"),
    );
    expect(statSync(backendFilePath).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(backendFilePath, "utf8"))).toMatchObject({
      id: "cloud:prod",
      name: "Production Cloud",
      host: "https://app.all-hands.dev",
      kind: "cloud",
      api_key: "oh-key",
    });

    const getResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: { "X-Session-API-Key": "session-key" },
    });
    await expect(getResponse.json()).resolves.toMatchObject({
      backends: [
        {
          id: "cloud:prod",
          name: "Production Cloud",
          host: "https://app.all-hands.dev",
          kind: "cloud",
          api_key: "oh-key",
        },
      ],
    });

    const bearerResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: { Authorization: "Bearer session-key" },
    });
    expect(bearerResponse.ok).toBe(true);

    const deleteResponse = await fetch(
      `${baseUrl}${SETUP_BACKENDS_ENDPOINT}?id=${encodeURIComponent("cloud:prod")}`,
      {
        method: "DELETE",
        headers: { "X-Session-API-Key": "session-key" },
      },
    );
    expect(deleteResponse.ok).toBe(true);
    expect(existsSync(backendFilePath)).toBe(false);
  });

  it("preserves credential file permissions across endpoint module reloads", async () => {
    if (process.platform === "win32") return;

    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify(cloudCredentialPayload),
    });
    expect(saveResponse.ok).toBe(true);

    vi.resetModules();
    // @ts-ignore - Node-only ESM handler used directly by dev servers.
    const reloadedEndpoint =
      await import("../../scripts/setup_server/endpoints/backend-credentials.mjs");
    const backendFilePath =
      reloadedEndpoint.getAgentCanvasBackendFilePath("cloud");
    expect(statSync(backendFilePath).mode & 0o777).toBe(0o600);
    expect(reloadedEndpoint.readAgentCanvasBackendCredentials()).toEqual([
      expect.objectContaining({
        id: "cloud",
        api_key: "oh-key",
      }),
    ]);
  });

  it("rejects credential writes on Windows where secure ACLs are unsupported", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    );
    if (!platformDescriptor?.configurable) return;

    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });
    vi.resetModules();

    try {
      // @ts-ignore - Node-only ESM handler used directly by dev servers.
      const endpoint =
        await import("../../scripts/setup_server/endpoints/backend-credentials.mjs");
      expect(() =>
        endpoint.writeAgentCanvasBackendCredential(cloudCredentialPayload),
      ).toThrow(
        "Backend credential persistence is not supported on Windows because secure NTFS ACL enforcement is not implemented",
      );
      expect(existsSync(path.join(tempDir, "agent-canvas", "backends"))).toBe(
        false,
      );
    } finally {
      Object.defineProperty(process, "platform", platformDescriptor);
      vi.resetModules();
    }
  });

  it("rejects non-cloud backend credentials", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "local",
        name: "Local",
        host: "http://localhost:18000",
        kind: "local",
        api_key: "session-key",
      }),
    });

    expect(saveResponse.status).toBe(400);
  });

  it("rejects malformed backend hosts", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "cloud",
        name: "Cloud",
        host: "javascript:alert(1)",
        kind: "cloud",
        api_key: "oh-key",
      }),
    });

    expect(saveResponse.status).toBe(400);
    await expect(saveResponse.json()).resolves.toMatchObject({
      error: "host must use http or https",
    });
  });

  it("rejects backend hosts with embedded credentials", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "cloud",
        name: "Cloud",
        host: "https://user:pass@app.all-hands.dev",
        kind: "cloud",
        api_key: "oh-key",
      }),
    });

    expect(saveResponse.status).toBe(400);
    await expect(saveResponse.json()).resolves.toMatchObject({
      error: "host must not include credentials",
    });
  });

  it("rejects oversized request bodies", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "cloud",
        name: "Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "x".repeat(70 * 1024),
      }),
    });

    expect(saveResponse.status).toBe(413);
  });

  it.each([
    ["missing id", { id: undefined }, "id is required"],
    ["empty name", { name: " " }, "name is required"],
    [
      "non-string api_key",
      { api_key: { value: "oh-key" } },
      "api_key is required",
    ],
    ["missing host", { host: undefined }, "host is required"],
  ])("rejects invalid required fields: %s", async (_name, patch, message) => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "cloud",
        name: "Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "oh-key",
        ...patch,
      }),
    });

    expect(saveResponse.status).toBe(400);
    await expect(saveResponse.json()).resolves.toMatchObject({
      error: message,
    });
  });

  it("rejects invalid JSON and non-object request bodies", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const invalidJsonResponse = await fetch(
      `${baseUrl}${SETUP_BACKENDS_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-API-Key": "session-key",
        },
        body: "{",
      },
    );
    expect(invalidJsonResponse.status).toBe(400);

    const nonObjectResponse = await fetch(
      `${baseUrl}${SETUP_BACKENDS_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-API-Key": "session-key",
        },
        body: JSON.stringify(["cloud"]),
      },
    );
    expect(nonObjectResponse.status).toBe(400);
    await expect(nonObjectResponse.json()).resolves.toMatchObject({
      error: "Backend credential payload is required",
    });
  });

  it("rejects path traversal attempts in backend ids", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "../../../etc/passwd",
        name: "Malicious",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "oh-key",
      }),
    });

    expect(saveResponse.status).toBe(400);
    await expect(saveResponse.json()).resolves.toMatchObject({
      error: "id must not contain path separators",
    });
    expect(existsSync(path.join(tempDir, "etc", "passwd"))).toBe(false);
  });

  it("rejects path traversal segments in backend ids", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "cloud..prod",
        name: "Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "oh-key",
      }),
    });

    expect(saveResponse.status).toBe(400);
    await expect(saveResponse.json()).resolves.toMatchObject({
      error: "id must not contain path traversal segments",
    });
  });

  it("rejects sensitive OPENHANDS_PERSISTENCE_DIR values", async () => {
    process.env.OPENHANDS_PERSISTENCE_DIR = "/etc";
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "cloud",
        name: "Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "oh-key",
      }),
    });

    expect(saveResponse.status).toBe(400);
    await expect(saveResponse.json()).resolves.toMatchObject({
      error:
        "OPENHANDS_PERSISTENCE_DIR cannot point to sensitive system path /etc",
    });
  });

  it("rejects OPENHANDS_PERSISTENCE_DIR symlinks to sensitive paths", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    const etcLink = path.join(tempDir, "etc-link");
    try {
      symlinkSync("/etc", etcLink, "dir");
    } catch {
      return;
    }
    process.env.OPENHANDS_PERSISTENCE_DIR = etcLink;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify(cloudCredentialPayload),
    });

    expect(saveResponse.status).toBe(400);
    await expect(saveResponse.json()).resolves.toMatchObject({
      error:
        "OPENHANDS_PERSISTENCE_DIR cannot point to sensitive system path /etc",
    });
  });

  it("replaces credential-file symlinks instead of writing through them", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    mkdirSync(path.dirname(backendFilePath), { recursive: true, mode: 0o700 });
    const symlinkTarget = path.join(tempDir, "sensitive.txt");
    writeFileSync(symlinkTarget, "do not overwrite");
    try {
      symlinkSync(symlinkTarget, backendFilePath);
    } catch {
      return;
    }
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify(cloudCredentialPayload),
    });

    expect(saveResponse.ok).toBe(true);
    expect(readFileSync(symlinkTarget, "utf8")).toBe("do not overwrite");
    expect(lstatSync(backendFilePath).isSymbolicLink()).toBe(false);
    expect(JSON.parse(readFileSync(backendFilePath, "utf8"))).toMatchObject({
      api_key: "oh-key",
    });
  });

  it("publishes updates as a new inode when the old credential has a hard link", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const firstSaveResponse = await fetch(
      `${baseUrl}${SETUP_BACKENDS_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-API-Key": "session-key",
        },
        body: JSON.stringify({
          ...cloudCredentialPayload,
          api_key: "old-key",
        }),
      },
    );
    expect(firstSaveResponse.ok).toBe(true);

    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    const hardLinkPath = path.join(tempDir, "credential-hard-link.json");
    try {
      linkSync(backendFilePath, hardLinkPath);
    } catch {
      return;
    }

    const secondSaveResponse = await fetch(
      `${baseUrl}${SETUP_BACKENDS_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-API-Key": "session-key",
        },
        body: JSON.stringify({
          ...cloudCredentialPayload,
          api_key: "new-key",
        }),
      },
    );

    expect(secondSaveResponse.ok).toBe(true);
    expect(JSON.parse(readFileSync(backendFilePath, "utf8"))).toMatchObject({
      api_key: "new-key",
    });
    expect(JSON.parse(readFileSync(hardLinkPath, "utf8"))).toMatchObject({
      api_key: "old-key",
    });
  });

  it("returns a conflict when the backend credential is locked", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    mkdirSync(path.dirname(backendFilePath), { recursive: true, mode: 0o700 });
    writeFileSync(`${backendFilePath}.lock`, "");
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "cloud",
        name: "Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "oh-key",
      }),
    });

    expect(saveResponse.status).toBe(409);
    await expect(saveResponse.json()).resolves.toMatchObject({
      error: "Backend credential is locked",
    });
  });

  it("keeps malformed backend credential locks", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    mkdirSync(path.dirname(backendFilePath), { recursive: true, mode: 0o700 });
    const lockPath = `${backendFilePath}.lock`;
    writeFileSync(lockPath, "");
    const staleTime = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(lockPath, staleTime, staleTime);
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "cloud",
        name: "Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "oh-key",
      }),
    });

    expect(saveResponse.status).toBe(409);
    expect(existsSync(lockPath)).toBe(true);
  });

  it("removes stale lock symlinks without deleting their targets", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    mkdirSync(path.dirname(backendFilePath), {
      recursive: true,
      mode: 0o700,
    });
    const lockPath = `${backendFilePath}.lock`;
    const lockTarget = path.join(tempDir, "lock-target.json");
    writeFileSync(
      lockTarget,
      `${JSON.stringify({
        pid: 999999999,
        process_start: "linux:dead",
      })}\n`,
    );
    try {
      symlinkSync(lockTarget, lockPath);
    } catch {
      return;
    }
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify(cloudCredentialPayload),
    });

    expect(saveResponse.status).toBe(200);
    expect(readFileSync(lockTarget, "utf8")).toContain("linux:dead");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("keeps fresh backend credential locks for a live process", async () => {
    if (process.platform !== "linux") return;

    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    mkdirSync(path.dirname(backendFilePath), { recursive: true, mode: 0o700 });
    const lockPath = `${backendFilePath}.lock`;
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        pid: process.pid,
        process_start: getCurrentProcessStartTokenForTests(),
      })}\n`,
    );
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "cloud",
        name: "Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "oh-key",
      }),
    });

    expect(saveResponse.status).toBe(409);
    expect(JSON.parse(readFileSync(lockPath, "utf8"))).toMatchObject({
      pid: process.pid,
      process_start: getCurrentProcessStartTokenForTests(),
    });
  });

  it("keeps stale backend credential locks for a live process", async () => {
    if (process.platform !== "linux") return;

    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    mkdirSync(path.dirname(backendFilePath), { recursive: true, mode: 0o700 });
    const lockPath = `${backendFilePath}.lock`;
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        pid: process.pid,
        process_start: getCurrentProcessStartTokenForTests(),
      })}\n`,
    );
    const staleTime = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(lockPath, staleTime, staleTime);
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify(cloudCredentialPayload),
    });

    expect(saveResponse.status).toBe(409);
    expect(JSON.parse(readFileSync(lockPath, "utf8"))).toMatchObject({
      pid: process.pid,
      process_start: getCurrentProcessStartTokenForTests(),
    });
  });

  it("removes backend credential locks for a dead process", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    mkdirSync(path.dirname(backendFilePath), { recursive: true, mode: 0o700 });
    const lockPath = `${backendFilePath}.lock`;
    writeFileSync(lockPath, "999999999\n");
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify({
        id: "cloud",
        name: "Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "oh-key",
      }),
    });

    expect(saveResponse.status).toBe(200);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("removes backend credential locks when the PID has been reused", async () => {
    if (process.platform !== "linux") return;

    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    mkdirSync(path.dirname(backendFilePath), { recursive: true, mode: 0o700 });
    const lockPath = `${backendFilePath}.lock`;
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        pid: process.pid,
        process_start: "definitely-not-this-process",
      })}\n`,
    );
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify(cloudCredentialPayload),
    });

    expect(saveResponse.status).toBe(200);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("rejects credential writes when current process identity cannot be recorded", async () => {
    if (process.platform !== "linux") return;

    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const endpoint = await importEndpointWithFsMock({
      readFileSync: vi.fn((target, options) => {
        if (String(target) === `/proc/${process.pid}/stat`) {
          throw new Error("proc read failed");
        }
        return actualFs.readFileSync(
          target as Parameters<typeof actualFs.readFileSync>[0],
          options as Parameters<typeof actualFs.readFileSync>[1],
        );
      }),
    });
    const backendFilePath = endpoint.getAgentCanvasBackendFilePath("cloud");
    const lockPath = `${backendFilePath}.lock`;

    expect(() =>
      endpoint.writeAgentCanvasBackendCredential(cloudCredentialPayload),
    ).toThrow(
      "Backend credential locking requires process start token support on this platform",
    );
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(backendFilePath)).toBe(false);
  });

  it("throws when secure backend directory permissions cannot be set", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const chmodError = new Error("chmod denied");
    const endpoint = await importEndpointWithFsMock({
      chmodSync: vi.fn(() => {
        throw chmodError;
      }),
    });

    expect(() =>
      endpoint.writeAgentCanvasBackendCredential(cloudCredentialPayload),
    ).toThrow("Failed to set secure directory permissions");
  });

  it("rejects existing backend directories with insecure permissions", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    const backendsDir = path.dirname(backendFilePath);
    mkdirSync(backendsDir, { recursive: true, mode: 0o700 });
    chmodSync(backendsDir, 0o755);
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify(cloudCredentialPayload),
    });

    expect(saveResponse.status).toBe(400);
    await expect(saveResponse.json()).resolves.toMatchObject({
      error: expect.stringContaining(
        "Directory exists with insecure permissions",
      ),
    });
  });

  it("rejects existing backend directory symlinks", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const symlinkTarget = path.join(tempDir, "backend-target");
    mkdirSync(symlinkTarget, { mode: 0o700 });
    try {
      symlinkSync(symlinkTarget, path.join(tempDir, "agent-canvas"), "dir");
    } catch {
      return;
    }
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify(cloudCredentialPayload),
    });

    expect(saveResponse.status).toBe(400);
    await expect(saveResponse.json()).resolves.toMatchObject({
      error: expect.stringContaining("Directory path is not a directory"),
    });
  });

  it("creates missing backend credential directory segments with private permissions", async () => {
    if (process.platform === "win32") return;

    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    const persistenceDir = path.join(tempDir, "custom", "nested");
    process.env.OPENHANDS_PERSISTENCE_DIR = persistenceDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify(cloudCredentialPayload),
    });

    expect(saveResponse.ok).toBe(true);
    for (const dir of [
      path.join(tempDir, "custom"),
      persistenceDir,
      path.join(persistenceDir, "agent-canvas"),
      path.join(persistenceDir, "agent-canvas", "backends"),
    ]) {
      expect(statSync(dir).mode & 0o777).toBe(0o700);
    }
  });

  it("throws and removes temp files when secure credential file permissions cannot be set", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const chmodError = new Error("fchmod denied");
    const endpoint = await importEndpointWithFsMock({
      fchmodSync: vi.fn(() => {
        throw chmodError;
      }),
    });
    const backendFilePath = endpoint.getAgentCanvasBackendFilePath("cloud");

    expect(() =>
      endpoint.writeAgentCanvasBackendCredential(cloudCredentialPayload),
    ).toThrow("Failed to set secure file permissions");

    expect(existsSync(backendFilePath)).toBe(false);
    expect(
      readdirSync(path.dirname(backendFilePath)).filter((name) =>
        name.endsWith(".tmp"),
      ),
    ).toEqual([]);
  });

  it("fsyncs credential writes before publishing them", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const fsyncCalls: number[] = [];
    const endpoint = await importEndpointWithFsMock({
      fsyncSync: vi.fn((fd) => {
        fsyncCalls.push(fd as number);
        return actualFs.fsyncSync(fd as number);
      }),
    });

    expect(
      endpoint.writeAgentCanvasBackendCredential(cloudCredentialPayload),
    ).toMatchObject({
      id: "cloud",
    });
    expect(fsyncCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("cleans stale credential temp files before writing", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    const backendsDir = path.dirname(backendFilePath);
    mkdirSync(backendsDir, { recursive: true, mode: 0o700 });
    const staleTempFile = path.join(
      backendsDir,
      "cloud.json.aaaaaaaaaaaaaaaa.tmp",
    );
    const freshTempFile = path.join(
      backendsDir,
      "cloud.json.bbbbbbbbbbbbbbbb.tmp",
    );
    writeFileSync(staleTempFile, "stale");
    writeFileSync(freshTempFile, "fresh");
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    utimesSync(staleTempFile, staleTime, staleTime);

    const baseUrl = await startTestServer();
    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify(cloudCredentialPayload),
    });

    expect(saveResponse.ok).toBe(true);
    expect(existsSync(staleTempFile)).toBe(false);
    expect(existsSync(freshTempFile)).toBe(true);
  });

  it("removes stale credential temp symlinks without deleting their targets", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    const backendsDir = path.dirname(backendFilePath);
    mkdirSync(backendsDir, { recursive: true, mode: 0o700 });
    const tempSymlink = path.join(
      backendsDir,
      "cloud.json.aaaaaaaaaaaaaaaa.tmp",
    );
    const tempTarget = path.join(tempDir, "temp-target.txt");
    writeFileSync(tempTarget, "do not delete");
    try {
      symlinkSync(tempTarget, tempSymlink);
      const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      lutimesSync(tempSymlink, staleTime, staleTime);
    } catch {
      return;
    }
    const baseUrl = await startTestServer();

    const saveResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-API-Key": "session-key",
      },
      body: JSON.stringify(cloudCredentialPayload),
    });

    expect(saveResponse.ok).toBe(true);
    expect(existsSync(tempSymlink)).toBe(false);
    expect(readFileSync(tempTarget, "utf8")).toBe("do not delete");
  });

  it("removes locks even when closing the lock file descriptor throws", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const closeError = new Error("close failed");
    let closeCount = 0;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const endpoint = await importEndpointWithFsMock({
      closeSync: vi.fn((fd) => {
        closeCount += 1;
        actualFs.closeSync(fd as number);
        if (closeCount === 3) {
          throw closeError;
        }
      }),
    });
    const backendFilePath = endpoint.getAgentCanvasBackendFilePath("cloud");

    expect(
      endpoint.writeAgentCanvasBackendCredential(cloudCredentialPayload),
    ).toMatchObject({
      id: "cloud",
    });
    expect(existsSync(`${backendFilePath}.lock`)).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to close backend credential lock"),
      closeError,
    );
  });

  it("does not mask write errors when lock cleanup fails", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const cleanupError = new Error("lock cleanup failed");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const endpoint = await importEndpointWithFsMock({
      rmSync: vi.fn((target, options) => {
        if (String(target).endsWith(".lock")) {
          throw cleanupError;
        }
        return actualFs.rmSync(
          target as Parameters<typeof actualFs.rmSync>[0],
          options as Parameters<typeof actualFs.rmSync>[1],
        );
      }),
    });
    const backendFilePath = endpoint.getAgentCanvasBackendFilePath("cloud");
    mkdirSync(path.dirname(backendFilePath), { recursive: true, mode: 0o700 });
    mkdirSync(backendFilePath);

    let thrown: Error | null = null;
    try {
      endpoint.writeAgentCanvasBackendCredential(cloudCredentialPayload);
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).not.toContain("lock cleanup failed");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to remove backend credential file"),
      cleanupError,
    );
  });

  it("handles concurrent writes to the same backend credential", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-API-Key": "session-key",
          },
          body: JSON.stringify({
            ...cloudCredentialPayload,
            api_key: `oh-key-${index}`,
          }),
        }),
      ),
    );

    expect(responses.every((response) => response.ok)).toBe(true);

    const getResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: { "X-Session-API-Key": "session-key" },
    });
    const data = await getResponse.json();
    expect(data.backends).toHaveLength(1);
    expect(data.backends[0].api_key).toMatch(/^oh-key-\d$/);
  });

  it("serializes concurrent stale-lock cleanup through exclusive lock creation", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendFilePath = getAgentCanvasBackendFilePath("cloud");
    mkdirSync(path.dirname(backendFilePath), { recursive: true, mode: 0o700 });
    const lockPath = `${backendFilePath}.lock`;
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        pid: 999999999,
        process_start: "linux:dead",
      })}\n`,
    );
    const baseUrl = await startTestServer();

    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-API-Key": "session-key",
          },
          body: JSON.stringify({
            ...cloudCredentialPayload,
            api_key: `oh-key-${index}`,
          }),
        }),
      ),
    );

    expect(responses.some((response) => response.ok)).toBe(true);
    expect(
      responses.every((response) => response.ok || response.status === 409),
    ).toBe(true);
    expect(existsSync(lockPath)).toBe(false);
    expect(() =>
      JSON.parse(readFileSync(backendFilePath, "utf8")),
    ).not.toThrow();
  });

  it("returns a clear error when deleting without a backend id", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    const deleteResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      method: "DELETE",
      headers: { "X-Session-API-Key": "session-key" },
    });

    expect(deleteResponse.status).toBe(400);
    await expect(deleteResponse.json()).resolves.toMatchObject({
      error: "Missing id parameter",
    });
  });

  it("logs corrupted backend credential files and skips them", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendsDir = path.join(tempDir, "agent-canvas", "backends");
    mkdirSync(backendsDir, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(backendsDir, "cloud.json"), "{not json", {
      mode: 0o600,
    });
    const baseUrl = await startTestServer();

    const getResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: { "X-Session-API-Key": "session-key" },
    });

    await expect(getResponse.json()).resolves.toEqual({ backends: [] });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to read backend credential from"),
      expect.any(SyntaxError),
    );
  });

  it("logs credential files with insecure permissions and skips them", async () => {
    if (process.platform === "win32") return;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const backendsDir = path.join(tempDir, "agent-canvas", "backends");
    mkdirSync(backendsDir, { recursive: true, mode: 0o700 });
    const insecureFile = path.join(backendsDir, "cloud.json");
    writeFileSync(insecureFile, JSON.stringify(cloudCredentialPayload), {
      mode: 0o600,
    });
    chmodSync(insecureFile, 0o644);
    const baseUrl = await startTestServer();

    const getResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: { "X-Session-API-Key": "session-key" },
    });

    await expect(getResponse.json()).resolves.toEqual({ backends: [] });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to read backend credential from"),
      expect.objectContaining({
        message: expect.stringContaining(
          "Insecure credential file permissions",
        ),
      }),
    );
  });

  it("does not read credentials through backend directory symlinks", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const symlinkTarget = path.join(tempDir, "backend-target");
    const targetBackendsDir = path.join(symlinkTarget, "backends");
    mkdirSync(targetBackendsDir, { recursive: true, mode: 0o700 });
    writeFileSync(
      path.join(targetBackendsDir, "cloud.json"),
      JSON.stringify(cloudCredentialPayload),
      { mode: 0o600 },
    );
    try {
      symlinkSync(symlinkTarget, path.join(tempDir, "agent-canvas"), "dir");
    } catch {
      return;
    }
    const baseUrl = await startTestServer();

    const getResponse = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: { "X-Session-API-Key": "session-key" },
    });

    await expect(getResponse.json()).resolves.toEqual({ backends: [] });
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to read Agent Canvas backend credentials",
      expect.objectContaining({
        message: expect.stringContaining("Directory path is not a directory"),
      }),
    );
  });

  it("rate limits repeated unauthorized attempts", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    for (let index = 0; index < 10; index += 1) {
      const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
        headers: { "X-Session-API-Key": "wrong-key" },
      });
      expect(response.status).toBe(401);
    }

    const rateLimited = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: { "X-Session-API-Key": "wrong-key" },
    });
    expect(rateLimited.status).toBe(429);
  });

  it("applies a global unauthorized-attempt rate limit across many clients", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    process.env.SETUP_SERVER_AUTH_RATE_LIMIT_GLOBAL_MAX_FAILURES = "3";
    trustLocalProxyForTests();
    const baseUrl = await startTestServer();

    for (let index = 0; index < 3; index += 1) {
      const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
        headers: {
          "X-Forwarded-For": `2001:db8::${index.toString(16)}`,
          "X-Session-API-Key": "wrong-key",
        },
      });
      expect(response.status).toBe(401);
    }

    const rateLimited = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: {
        "X-Forwarded-For": "2001:db8::ff",
        "X-Session-API-Key": "wrong-key",
      },
    });
    expect(rateLimited.status).toBe(429);
  });

  it("applies a global request rate limit across many clients", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    process.env.SETUP_SERVER_REQUEST_RATE_LIMIT_GLOBAL_MAX_REQUESTS = "3";
    trustLocalProxyForTests();
    const baseUrl = await startTestServer();

    for (let index = 0; index < 3; index += 1) {
      const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
        headers: {
          "X-Forwarded-For": `2001:db8::${index.toString(16)}`,
          "X-Session-API-Key": "session-key",
        },
      });
      expect(response.status).toBe(200);
    }

    const rateLimited = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: {
        "X-Forwarded-For": "2001:db8::ff",
        "X-Session-API-Key": "session-key",
      },
    });
    expect(rateLimited.status).toBe(429);
  });

  it("does not trust spoofed forwarded-for headers by default", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    for (let index = 0; index < 10; index += 1) {
      const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
        headers: {
          "X-Forwarded-For": `2001:db8::${index.toString(16)}`,
          "X-Session-API-Key": "wrong-key",
        },
      });
      expect(response.status).toBe(401);
    }

    const rateLimited = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: {
        "X-Forwarded-For": "203.0.113.250",
        "X-Session-API-Key": "wrong-key",
      },
    });
    expect(rateLimited.status).toBe(429);
  });

  it("does not trust forwarded-for headers without a trusted proxy allowlist", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    process.env.SETUP_SERVER_TRUST_PROXY = "true";
    delete process.env.SETUP_SERVER_TRUSTED_PROXY_IPS;
    const baseUrl = await startTestServer();

    for (let index = 0; index < 10; index += 1) {
      const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
        headers: {
          "X-Forwarded-For": `2001:db8::${index.toString(16)}`,
          "X-Session-API-Key": "wrong-key",
        },
      });
      expect(response.status).toBe(401);
    }

    const rateLimited = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: {
        "X-Forwarded-For": "203.0.113.250",
        "X-Session-API-Key": "wrong-key",
      },
    });
    expect(rateLimited.status).toBe(429);
  });

  it("warns and ignores invalid trusted proxy allowlist entries", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    process.env.SETUP_SERVER_TRUST_PROXY = "true";
    process.env.SETUP_SERVER_TRUSTED_PROXY_IPS = "not-an-ip";
    const baseUrl = await startTestServer();

    const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: {
        "X-Forwarded-For": "203.0.113.250",
        "X-Session-API-Key": "wrong-key",
      },
    });

    expect(response.status).toBe(401);
    expect(warnSpy).toHaveBeenCalledWith(
      "Ignoring invalid SETUP_SERVER_TRUSTED_PROXY_IPS entries: not-an-ip",
    );
  });

  it("ignores invalid forwarded-for headers when proxy trust is enabled", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    trustLocalProxyForTests();
    const baseUrl = await startTestServer();

    for (let index = 0; index < 10; index += 1) {
      const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
        headers: {
          "X-Forwarded-For": `not-an-ip-${index}`,
          "X-Session-API-Key": "wrong-key",
        },
      });
      expect(response.status).toBe(401);
    }

    const rateLimited = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: {
        "X-Forwarded-For": "still-not-an-ip",
        "X-Session-API-Key": "wrong-key",
      },
    });
    expect(rateLimited.status).toBe(429);
  });

  it("uses the proxy-appended forwarded-for entry when proxy trust is enabled", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    trustLocalProxyForTests();
    const baseUrl = await startTestServer();

    for (let index = 0; index < 10; index += 1) {
      const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
        headers: {
          "X-Forwarded-For": `127.0.0.${index}, 203.0.113.10`,
          "X-Session-API-Key": "wrong-key",
        },
      });
      expect(response.status).toBe(401);
    }

    const rateLimited = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: {
        "X-Forwarded-For": "127.0.0.250, 203.0.113.10",
        "X-Session-API-Key": "wrong-key",
      },
    });
    expect(rateLimited.status).toBe(429);
  });

  it("expires auth rate limit entries after the configured window", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    const baseUrl = await startTestServer();

    for (let index = 0; index < 10; index += 1) {
      const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
        headers: { "X-Session-API-Key": "wrong-key" },
      });
      expect(response.status).toBe(401);
    }

    const rateLimited = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: { "X-Session-API-Key": "wrong-key" },
    });
    expect(rateLimited.status).toBe(429);

    nowSpy.mockReturnValue(62_000);
    const afterWindow = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
      headers: { "X-Session-API-Key": "wrong-key" },
    });
    expect(afterWindow.status).toBe(401);
  });

  it("bounds auth failure tracking across many clients", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    trustLocalProxyForTests();
    const baseUrl = await startTestServer();

    for (let index = 0; index < 1030; index += 1) {
      const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
        headers: {
          "X-Forwarded-For": `2001:db8::${index.toString(16)}`,
          "X-Session-API-Key": "wrong-key",
        },
      });
      expect(response.status).toBe(401);
    }

    expect(__getSetupBackendsAuthRateLimitSizeForTests()).toBeLessThanOrEqual(
      1024,
    );
  });

  it("evicts the least recently active auth failure entry when the map is full", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000);
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    process.env.VITE_SESSION_API_KEY = "session-key";
    trustLocalProxyForTests();
    const baseUrl = await startTestServer();
    const firstClient = "2001:db8::feed";

    for (let index = 0; index < 1024; index += 1) {
      nowSpy.mockReturnValue(1_000 + index);
      const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
        headers: {
          "X-Forwarded-For":
            index === 0 ? firstClient : `2001:db8::${index.toString(16)}`,
          "X-Session-API-Key": "wrong-key",
        },
      });
      expect(response.status).toBe(401);
    }

    for (let index = 0; index < 9; index += 1) {
      nowSpy.mockReturnValue(3_000 + index);
      const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`, {
        headers: {
          "X-Forwarded-For": firstClient,
          "X-Session-API-Key": "wrong-key",
        },
      });
      expect(response.status).toBe(401);
    }

    nowSpy.mockReturnValue(4_000);
    const newClientResponse = await fetch(
      `${baseUrl}${SETUP_BACKENDS_ENDPOINT}`,
      {
        headers: {
          "X-Forwarded-For": "2001:db8::ffff",
          "X-Session-API-Key": "wrong-key",
        },
      },
    );
    expect(newClientResponse.status).toBe(401);

    nowSpy.mockReturnValue(4_001);
    const rateLimitedFirstClient = await fetch(
      `${baseUrl}${SETUP_BACKENDS_ENDPOINT}`,
      {
        headers: {
          "X-Forwarded-For": firstClient,
          "X-Session-API-Key": "wrong-key",
        },
      },
    );
    expect(rateLimitedFirstClient.status).toBe(429);
  });

  it("rate limits requests even when no session API key is configured", async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-backends-"));
    process.env.OPENHANDS_PERSISTENCE_DIR = tempDir;
    delete process.env.VITE_SESSION_API_KEY;
    const baseUrl = await startTestServer();

    for (let index = 0; index < 120; index += 1) {
      const response = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`);
      expect(response.status).toBe(200);
    }

    const rateLimited = await fetch(`${baseUrl}${SETUP_BACKENDS_ENDPOINT}`);
    expect(rateLimited.status).toBe(429);
  });
});
