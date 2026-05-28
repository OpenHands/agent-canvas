import { describe, expect, it } from "vitest";
import {
  ACP_CUSTOM_PRESET_KEY,
  ACP_PROVIDERS,
  buildAcpAgentSettingsDiff,
  getAcpProviderDisplayName,
} from "#/constants/acp-providers";

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

describe("ACP provider registry", () => {
  it("keeps every built-in default model in the UX suggestions", () => {
    for (const provider of ACP_PROVIDERS) {
      expect(provider.default_model, provider.key).toBeTruthy();
      expect(provider.available_models, provider.key).toBeTruthy();
      expect(
        provider.available_models?.some(
          (model) => model.id === provider.default_model,
        ),
        provider.key,
      ).toBe(true);
    }
  });

  it("does not suggest generic default model placeholders", () => {
    for (const provider of ACP_PROVIDERS) {
      for (const model of provider.available_models ?? []) {
        expect(model.id.toLowerCase()).not.toBe("default");
        expect(model.label.toLowerCase()).not.toContain("default");
      }
    }
  });

  it("seeds built-in ACP diffs with the provider default model", () => {
    for (const provider of ACP_PROVIDERS) {
      expect(buildAcpAgentSettingsDiff(provider.key)).toMatchObject({
        agent_kind: "acp",
        acp_server: provider.key,
        acp_model: provider.default_model,
      });
    }
  });

  it("keeps custom ACP diffs model-optional", () => {
    expect(buildAcpAgentSettingsDiff(ACP_CUSTOM_PRESET_KEY)).toMatchObject({
      agent_kind: "acp",
      acp_server: ACP_CUSTOM_PRESET_KEY,
      acp_model: null,
    });
  });
});
