// @vitest-environment node
import { createServer } from "node:http";
import {
  chmod,
  mkdtemp,
  readFile,
  stat,
  symlink,
  unlink,
  writeFile,
  utimes,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleSetupServerRequest } from "../../scripts/setup_server/handle-setup-server-request.mjs";

const SESSION_KEY = "session-secret";

let previousPersistenceDir: string | undefined;
let previousSessionKey: string | undefined;
let previousSecondarySessionKey: string | undefined;
let baseUrl = "";
let closeServer: (() => Promise<void>) | null = null;

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  return { "X-Session-API-Key": SESSION_KEY, ...extra };
}

function credentialDir() {
  return path.join(
    process.env.OPENHANDS_PERSISTENCE_DIR!,
    "agent-canvas",
    "backends",
  );
}

function encodedCredentialFile(id: string) {
  return path.join(
    credentialDir(),
    `${Buffer.from(id, "utf8").toString("base64url")}.json`,
  );
}

async function readCurrentProcessStartTime() {
  if (process.platform !== "linux") return null;
  const stat = await readFile(`/proc/${process.pid}/stat`, "utf8");
  const endOfCommand = stat.lastIndexOf(")");
  return (
    stat
      .slice(endOfCommand + 2)
      .trim()
      .split(/\s+/)[19] || null
  );
}

async function startServer() {
  const server = createServer(async (req, res) => {
    if (await handleSetupServerRequest(req, res)) return;
    res.writeHead(404);
    res.end("Not Found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  baseUrl = `http://127.0.0.1:${address.port}`;
  closeServer = () => new Promise((resolve) => server.close(() => resolve()));
}

beforeEach(async () => {
  previousPersistenceDir = process.env.OPENHANDS_PERSISTENCE_DIR;
  previousSessionKey = process.env.SESSION_API_KEY;
  previousSecondarySessionKey = process.env.OH_SESSION_API_KEYS_1;
  process.env.OPENHANDS_PERSISTENCE_DIR = await mkdtemp(
    path.join(os.tmpdir(), "agent-canvas-credentials-"),
  );
  process.env.SESSION_API_KEY = SESSION_KEY;
  await startServer();
});

afterEach(async () => {
  if (closeServer) await closeServer();
  closeServer = null;
  if (previousPersistenceDir === undefined)
    delete process.env.OPENHANDS_PERSISTENCE_DIR;
  else process.env.OPENHANDS_PERSISTENCE_DIR = previousPersistenceDir;
  if (previousSessionKey === undefined) delete process.env.SESSION_API_KEY;
  else process.env.SESSION_API_KEY = previousSessionKey;
  if (previousSecondarySessionKey === undefined)
    delete process.env.OH_SESSION_API_KEYS_1;
  else process.env.OH_SESSION_API_KEYS_1 = previousSecondarySessionKey;
});

describe("/setup/backends", () => {
  it("persists, lists, and deletes Cloud backend credentials", async () => {
    const credential = {
      id: "cloud-1",
      name: "OpenHands Cloud",
      host: "https://app.all-hands.dev/",
      kind: "cloud",
      api_key: "cloud-api-key",
    };

    const saveResponse = await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(credential),
    });
    await expect(saveResponse.json()).resolves.toEqual({
      backend: { ...credential, host: "https://app.all-hands.dev" },
    });

    const listResponse = await fetch(`${baseUrl}/setup/backends`, {
      headers: authHeaders(),
    });
    await expect(listResponse.json()).resolves.toEqual({
      backends: [{ ...credential, host: "https://app.all-hands.dev" }],
    });

    const deleteResponse = await fetch(`${baseUrl}/setup/backends/cloud-1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(deleteResponse.ok).toBe(true);

    const emptyResponse = await fetch(`${baseUrl}/setup/backends`, {
      headers: authHeaders(),
    });
    await expect(emptyResponse.json()).resolves.toEqual({ backends: [] });
  });

  it("writes credential files with private permissions", async () => {
    await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "cloud-api-key",
      }),
    });

    const dirStat = await stat(credentialDir());
    expect(dirStat.mode & 0o777).toBe(0o700);

    const fileStat = await stat(encodedCredentialFile("cloud-1"));
    expect(fileStat.mode & 0o777).toBe(0o600);
    await expect(
      readFile(encodedCredentialFile("cloud-1"), "utf8"),
    ).resolves.toContain("cloud-api-key");
  });

  it("requires the configured session API key and fails closed", async () => {
    const unauthorized = await fetch(`${baseUrl}/setup/backends`);
    expect(unauthorized.status).toBe(401);

    delete process.env.SESSION_API_KEY;
    const noConfiguredKey = await fetch(`${baseUrl}/setup/backends`);
    expect(noConfiguredKey.status).toBe(401);

    process.env.SESSION_API_KEY = SESSION_KEY;
    const authorized = await fetch(`${baseUrl}/setup/backends`, {
      headers: authHeaders(),
    });
    expect(authorized.status).toBe(200);
  });

  it("rate limits repeated authentication failures", async () => {
    for (let i = 0; i < 10; i += 1) {
      const response = await fetch(`${baseUrl}/setup/backends`, {
        headers: { "X-Session-API-Key": "wrong-key" },
      });
      expect(response.status).toBe(401);
    }

    const limited = await fetch(`${baseUrl}/setup/backends`, {
      headers: { "X-Session-API-Key": "wrong-key" },
    });
    expect(limited.status).toBe(429);
  });

  it("accepts bearer auth and additional configured session keys", async () => {
    process.env.OH_SESSION_API_KEYS_1 = "secondary-secret";
    const response = await fetch(`${baseUrl}/setup/backends`, {
      headers: { Authorization: "Bearer secondary-secret" },
    });
    expect(response.status).toBe(200);
  });

  it("rejects oversized request bodies", async () => {
    const response = await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: "x".repeat(65 * 1024),
    });
    expect(response.status).toBe(413);
  });

  it("rejects credential symlinks on delete", async () => {
    await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "cloud-api-key",
      }),
    });

    const credentialFile = encodedCredentialFile("cloud-1");
    await unlink(credentialFile);
    await symlink(path.join(os.tmpdir(), "not-a-credential"), credentialFile);

    const response = await fetch(`${baseUrl}/setup/backends/cloud-1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(response.status).toBe(500);
  });

  it("rejects insecure existing credential file permissions", async () => {
    await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "cloud-api-key",
      }),
    });
    await chmod(encodedCredentialFile("cloud-1"), 0o644);

    const response = await fetch(`${baseUrl}/setup/backends`, {
      headers: authHeaders(),
    });
    expect(response.status).toBe(500);
  });

  it("fails closed on unsupported Windows credential persistence", async () => {
    const platformSpy = vi
      .spyOn(process, "platform", "get")
      .mockReturnValue("win32");
    const response = await fetch(`${baseUrl}/setup/backends`, {
      headers: authHeaders(),
    });
    expect(response.status).toBe(500);
    platformSpy.mockRestore();
  });

  it("rejects non-Cloud or malformed credential payloads", async () => {
    const response = await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        id: "local-1",
        name: "Local",
        host: "http://localhost:8000",
        kind: "local",
        api_key: "local-key",
      }),
    });

    expect(response.status).toBe(400);
  });

  it("does not remove lock files owned by a running process", async () => {
    await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        id: "initial",
        name: "Initial",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "initial-key",
      }),
    });

    const lockFile = `${encodedCredentialFile("__store__")}.lock`;
    await writeFile(
      lockFile,
      JSON.stringify({
        pid: process.pid,
        process_start_time: await readCurrentProcessStartTime(),
      }),
      { mode: 0o600 },
    );
    const staleTime = new Date(Date.now() - 60_000);
    await utimes(lockFile, staleTime, staleTime);

    const response = await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        id: "blocked",
        name: "Blocked",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "blocked-key",
      }),
    });

    expect(response.status).toBe(500);
    await expect(readFile(lockFile, "utf8")).resolves.toContain(
      String(process.pid),
    );
  });

  it("deduplicates concurrent equivalent credential writes", async () => {
    const payload = {
      name: "OpenHands Cloud",
      host: "https://app.all-hands.dev",
      kind: "cloud",
      api_key: "shared-key",
    };

    const responses = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        fetch(`${baseUrl}/setup/backends`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ ...payload, id: `cloud-${index}` }),
        }),
      ),
    );

    expect(responses.every((response) => response.ok)).toBe(true);
    const listResponse = await fetch(`${baseUrl}/setup/backends`, {
      headers: authHeaders(),
    });
    const { backends } = await listResponse.json();
    expect(backends).toHaveLength(1);
    expect(backends[0]).toEqual(
      expect.objectContaining({ api_key: "shared-key" }),
    );
  });
});
