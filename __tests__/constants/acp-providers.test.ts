import { describe, expect, it } from "vitest";
import { getAcpProviderDisplayName } from "#/constants/acp-providers";

describe("getAcpProviderDisplayName", () => {
  it("resolves the three built-in registry keys to their human names", () => {
    expect(getAcpProviderDisplayName("claude-code")).toBe("Claude Code");
    expect(getAcpProviderDisplayName("codex")).toBe("Codex");
    expect(getAcpProviderDisplayName("gemini-cli")).toBe("Gemini CLI");
  });

  it("returns null for the Custom-command preset so callers can fall back to the generic 'ACP' label", () => {
    // The custom preset has no canonical brand name — the registry
    // resolver intentionally returns null so the conversation card renders
    // ``CONVERSATION$ACP_AGENT_GENERIC`` ("ACP") instead.
    expect(getAcpProviderDisplayName("custom")).toBeNull();
  });

  it("returns null for unknown / forward-compatible keys", () => {
    // A future ACP server Canvas's registry doesn't know about yet
    // shouldn't crash or render a random fragment of the key — fall back
    // to the generic chip.
    expect(getAcpProviderDisplayName("future-acp-server")).toBeNull();
  });

  it("returns null for empty / null / undefined input", () => {
    expect(getAcpProviderDisplayName(null)).toBeNull();
    expect(getAcpProviderDisplayName(undefined)).toBeNull();
    expect(getAcpProviderDisplayName("")).toBeNull();
  });
});
