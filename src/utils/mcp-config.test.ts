import { describe, expect, it } from "vitest";
import { parseMcpConfig, toSdkMcpConfig } from "./mcp-config";

describe("mcp-config", () => {
  it("round-trips explicit OAuth authentication metadata for remote servers", () => {
    const sdkConfig = {
      mcpServers: {
        "superhuman-mail": {
          url: "https://mcp.mail.superhuman.com/mcp",
          auth: "oauth",
          authentication: {
            type: "oauth",
            client_auth_method: "none",
          },
        },
      },
    };

    const parsed = parseMcpConfig(sdkConfig);

    expect(parsed.shttp_servers).toEqual([
      {
        name: "superhuman-mail",
        url: "https://mcp.mail.superhuman.com/mcp",
        auth: "oauth",
        authentication: {
          type: "oauth",
          client_auth_method: "none",
        },
      },
    ]);
    expect(toSdkMcpConfig(parsed)).toEqual(sdkConfig);
  });
});
