import { describe, expect, it } from "vitest";

import { parseMcpConfig, toSdkMcpConfig } from "#/utils/mcp-config";
import type { MCPConfig } from "#/types/settings";

describe("toSdkMcpConfig", () => {
  it("uses bare base names when there are no collisions across server types", () => {
    // The bug we're guarding against: a shared monotonic counter would
    // emit "sse", "shttp_1", "myname_2" — bumping the stdio suffix every
    // time another server type's count changes. With per-base collision
    // suffixing, unrelated entries keep their bare names.
    const config: MCPConfig = {
      sse_servers: [{ url: "https://sse.example" }],
      shttp_servers: [{ url: "https://shttp.example" }],
      stdio_servers: [{ name: "myname", command: "/bin/run" }],
    };

    const out = toSdkMcpConfig(config);

    expect(out).not.toBeNull();
    expect(Object.keys(out!.mcpServers)).toEqual(["sse", "shttp", "myname"]);
  });

  it("only suffixes when the same base actually collides", () => {
    const config: MCPConfig = {
      sse_servers: [
        { url: "https://a.example" },
        { url: "https://b.example" },
        { url: "https://c.example" },
      ],
      shttp_servers: [
        { url: "https://d.example" },
        { url: "https://e.example" },
      ],
      stdio_servers: [],
    };

    const out = toSdkMcpConfig(config);

    expect(Object.keys(out!.mcpServers)).toEqual([
      "sse",
      "sse_1",
      "sse_2",
      "shttp",
      "shttp_1",
    ]);
  });

  it("preserves stdio names verbatim when distinct, even with sse/shttp present", () => {
    // Adding sse/shttp servers must not rename existing stdio entries.
    // This is the exact scenario the user reported: numbers appearing
    // on their stdio MCP server names when they edit unrelated entries.
    const config: MCPConfig = {
      sse_servers: [{ url: "https://x" }, { url: "https://y" }],
      shttp_servers: [{ url: "https://z" }],
      stdio_servers: [
        { name: "github", command: "/bin/gh" },
        { name: "filesystem", command: "/bin/fs" },
      ],
    };

    const out = toSdkMcpConfig(config);

    expect(out!.mcpServers).toMatchObject({
      sse: { url: "https://x" },
      sse_1: { url: "https://y" },
      shttp: { url: "https://z" },
      github: { command: "/bin/gh" },
      filesystem: { command: "/bin/fs" },
    });
  });

  it("suffixes only colliding stdio names", () => {
    const config: MCPConfig = {
      sse_servers: [],
      shttp_servers: [],
      stdio_servers: [
        { name: "tool", command: "/bin/a" },
        { name: "tool", command: "/bin/b" },
        { name: "other", command: "/bin/c" },
      ],
    };

    const out = toSdkMcpConfig(config);

    expect(Object.keys(out!.mcpServers)).toEqual(["tool", "tool_1", "other"]);
  });

  it("falls back to a 'stdio' base when a stdio entry has no name", () => {
    const config: MCPConfig = {
      sse_servers: [],
      shttp_servers: [],
      stdio_servers: [
        { name: "", command: "/bin/a" },
        { name: "", command: "/bin/b" },
      ],
    };

    const out = toSdkMcpConfig(config);

    expect(Object.keys(out!.mcpServers)).toEqual(["stdio", "stdio_1"]);
  });

  it("returns null when there are no servers", () => {
    expect(
      toSdkMcpConfig({ sse_servers: [], shttp_servers: [], stdio_servers: [] }),
    ).toBeNull();
  });

  it("keeps names stable across a parse → write round trip", () => {
    // Simulates loading the user's persisted settings, parsing them,
    // and re-serializing on save (which is what happens on every edit).
    // The keys must not drift between trips.
    const persisted = {
      mcpServers: {
        sse: { url: "https://x", transport: "sse" },
        sse_1: { url: "https://y", transport: "sse" },
        shttp: { url: "https://z" },
        github: { command: "/bin/gh" },
      },
    };

    const parsed = parseMcpConfig(persisted);
    const written = toSdkMcpConfig(parsed);

    expect(written).not.toBeNull();
    expect(Object.keys(written!.mcpServers).sort()).toEqual(
      Object.keys(persisted.mcpServers).sort(),
    );
  });

  it("does not bump the suffix on a stdio name when an sse server is added", () => {
    // Concretely demonstrates the user's report: editing/adding an sse
    // server must leave the stdio name untouched. The previous shared
    // counter implementation would rename "myname" → "myname_2" here.
    const before: MCPConfig = {
      sse_servers: [{ url: "https://a" }],
      shttp_servers: [],
      stdio_servers: [{ name: "myname", command: "/bin/run" }],
    };
    const after: MCPConfig = {
      sse_servers: [{ url: "https://a" }, { url: "https://b" }],
      shttp_servers: [],
      stdio_servers: [{ name: "myname", command: "/bin/run" }],
    };

    const out1 = toSdkMcpConfig(before)!.mcpServers;
    const out2 = toSdkMcpConfig(after)!.mcpServers;

    expect("myname" in out1).toBe(true);
    expect("myname" in out2).toBe(true);
  });
});
