// @vitest-environment node
import { createServer } from "node:http";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSetupServerRequest } from "../../scripts/setup_server/handle-setup-server-request.mjs";

let previousPersistenceDir: string | undefined;
let previousSessionKey: string | undefined;
let baseUrl = "";
let closeServer: (() => Promise<void>) | null = null;

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
  process.env.OPENHANDS_PERSISTENCE_DIR = await mkdtemp(
    path.join(os.tmpdir(), "agent-canvas-credentials-"),
  );
  delete process.env.SESSION_API_KEY;
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credential),
    });
    await expect(saveResponse.json()).resolves.toEqual({
      backend: { ...credential, host: "https://app.all-hands.dev" },
    });

    const listResponse = await fetch(`${baseUrl}/setup/backends`);
    await expect(listResponse.json()).resolves.toEqual({
      backends: [{ ...credential, host: "https://app.all-hands.dev" }],
    });

    const deleteResponse = await fetch(`${baseUrl}/setup/backends/cloud-1`, {
      method: "DELETE",
    });
    expect(deleteResponse.ok).toBe(true);

    const emptyResponse = await fetch(`${baseUrl}/setup/backends`);
    await expect(emptyResponse.json()).resolves.toEqual({ backends: [] });
  });

  it("writes credential files with private permissions", async () => {
    await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "cloud-1",
        name: "OpenHands Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
        api_key: "cloud-api-key",
      }),
    });

    const dir = path.join(
      process.env.OPENHANDS_PERSISTENCE_DIR!,
      "agent-canvas",
      "backends",
    );
    const dirStat = await stat(dir);
    expect(dirStat.mode & 0o777).toBe(0o700);

    const file = path.join(
      dir,
      `${Buffer.from("cloud-1", "utf8").toString("base64url")}.json`,
    );
    const fileStat = await stat(file);
    expect(fileStat.mode & 0o777).toBe(0o600);
    await expect(readFile(file, "utf8")).resolves.toContain("cloud-api-key");
  });

  it("requires the configured session API key", async () => {
    process.env.SESSION_API_KEY = "session-secret";

    const unauthorized = await fetch(`${baseUrl}/setup/backends`);
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`${baseUrl}/setup/backends`, {
      headers: { "X-Session-API-Key": "session-secret" },
    });
    expect(authorized.status).toBe(200);
  });

  it("rejects non-Cloud or malformed credential payloads", async () => {
    const response = await fetch(`${baseUrl}/setup/backends`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
});
