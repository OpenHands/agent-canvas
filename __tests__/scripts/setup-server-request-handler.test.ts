// @vitest-environment node
import { createServer, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
// @ts-ignore - Node-only ESM handler used directly by dev servers.
import { handleSetupServerRequest } from "../../scripts/setup_server/handle-setup-server-request.mjs";

describe("handleSetupServerRequest", () => {
  afterEach(() => {
    delete process.env.VITE_SESSION_API_KEY;
  });

  it("ignores non-setup requests", async () => {
    const handled = await handleSetupServerRequest(
      { url: "/api/settings" },
      {} as ServerResponse,
    );

    expect(handled).toBe(false);
  });

  it("returns 404 for unknown setup endpoints", async () => {
    const server = createServer((req, res) => {
      handleSetupServerRequest(req, res).then((handled) => {
        if (!handled) {
          res.writeHead(500);
          res.end("not handled");
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to start test server");
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/setup/unknown`,
      );
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: "Setup endpoint not found",
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
