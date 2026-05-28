import { http, HttpResponse } from "msw";

export const MCP_HANDLERS = [
  http.post("*/api/mcp/test", async () =>
    HttpResponse.json({ ok: true, tools: [] }),
  ),
];
