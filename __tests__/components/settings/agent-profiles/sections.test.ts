import { describe, expect, it } from "vitest";
import { getSectionsForKind } from "#/components/features/settings/agent-profiles/editor/sections";

describe("getSectionsForKind", () => {
  it("returns the OpenHands section set in order", () => {
    const ids = getSectionsForKind("openhands").map((s) => s.id);
    expect(ids).toEqual([
      "overview",
      "general",
      "model",
      "tools-mcp",
      "condenser",
    ]);
  });

  it("returns the ACP section set in order", () => {
    const ids = getSectionsForKind("acp").map((s) => s.id);
    expect(ids).toEqual([
      "overview",
      "general",
      "provider-model",
      "launch",
      "mcp",
      "authentication",
    ]);
  });

  it("never mixes kind-specific sections across kinds", () => {
    const oh = new Set(getSectionsForKind("openhands").map((s) => s.id));
    const acp = new Set(getSectionsForKind("acp").map((s) => s.id));
    // OpenHands-only sections must not leak into ACP and vice versa.
    expect(oh.has("model")).toBe(true);
    expect(acp.has("model")).toBe(false);
    expect(acp.has("provider-model")).toBe(true);
    expect(oh.has("provider-model")).toBe(false);
    expect(acp.has("authentication")).toBe(true);
    expect(oh.has("authentication")).toBe(false);
  });

  it("shares General + Overview across both kinds", () => {
    for (const kind of ["openhands", "acp"] as const) {
      const ids = getSectionsForKind(kind).map((s) => s.id);
      expect(ids).toContain("overview");
      expect(ids).toContain("general");
    }
  });
});
