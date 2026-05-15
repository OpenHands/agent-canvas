import type { Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startStaticServer } from "../../scripts/static-server.mjs";

describe("static-server.mjs", () => {
  const servers: Server[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );

    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function startServer(dir: string) {
    const server = await startStaticServer({
      port: 0,
      host: "127.0.0.1",
      dir,
      routes: {},
    });
    servers.push(server);

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Static server did not bind to a TCP port");
    }

    return `http://127.0.0.1:${address.port}`;
  }

  it("serves nested build assets on all platforms", async () => {
    const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
    tempDirs.push(buildDir);
    mkdirSync(path.join(buildDir, "assets"));
    writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");
    writeFileSync(
      path.join(buildDir, "assets", "entry.client-test.js"),
      "export const loaded = true;\n",
    );

    const origin = await startServer(buildDir);
    const response = await fetch(`${origin}/assets/entry.client-test.js`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/javascript",
    );
    await expect(response.text()).resolves.toContain("loaded = true");
  });

  it("keeps paths confined to the static directory", async () => {
    const parentDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-parent-"));
    tempDirs.push(parentDir);
    const buildDir = path.join(parentDir, "build");
    mkdirSync(buildDir);
    writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");
    writeFileSync(path.join(parentDir, "secret.txt"), "secret\n");

    const origin = await startServer(buildDir);
    const response = await fetch(`${origin}/../secret.txt`);

    expect(response.status).not.toBe(200);
    await expect(response.text()).resolves.not.toContain("secret");
  });
});
