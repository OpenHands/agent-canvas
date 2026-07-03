import { describe, expect, it } from "vitest";

import { flattenMcpConfig } from "#/utils/mcp-installed-servers";
import type { MCPConfig } from "#/types/settings";

describe("flattenMcpConfig", () => {
  it("preserves OAuth metadata and credentials for installed remote servers", () => {
    const config: MCPConfig = {
      sse_servers: [],
      stdio_servers: [],
      shttp_servers: [
        {
          name: "superhuman-mail",
          url: "https://mcp.mail.superhuman.com/mcp",
          auth: "oauth",
          authentication: {
            type: "oauth",
            client_auth_method: "none",
          },
          oauth_credentials: {
            "mcp-oauth-token": {
              "https://mcp.mail.superhuman.com/mcp/tokens": {
                value: { access_token: "gAAAAencrypted-access-token" },
              },
            },
          },
        },
      ],
    };

    expect(flattenMcpConfig(config)).toEqual([
      {
        id: "shttp-0",
        type: "shttp",
        name: "superhuman-mail",
        url: "https://mcp.mail.superhuman.com/mcp",
        headers: undefined,
        timeout: undefined,
        auth: "oauth",
        authentication: {
          type: "oauth",
          client_auth_method: "none",
        },
        oauth_credentials: {
          "mcp-oauth-token": {
            "https://mcp.mail.superhuman.com/mcp/tokens": {
              value: { access_token: "gAAAAencrypted-access-token" },
            },
          },
        },
      },
    ]);
  });
});
