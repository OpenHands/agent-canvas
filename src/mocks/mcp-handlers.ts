import { http, HttpResponse } from "msw";

export const MCP_HANDLERS = [
  http.post("*/api/mcp/test", () =>
    HttpResponse.json({
      ok: true,
      tools: [],
    }),
  ),
];
