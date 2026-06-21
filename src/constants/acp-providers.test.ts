import { describe, expect, it } from "vitest";
import {
  ACP_MANAGED_SENTINEL,
  getAllAcpReservedSecretNames,
  resolveEffectiveAcpModel,
} from "./acp-providers";

describe("resolveEffectiveAcpModel", () => {
  it("surfaces the real claude-agent-acp 0.44+ 'default' model", () => {
    // ``default`` ("Default (recommended)") is a real, selectable Claude model
    // in the configOptions select — the server reports it as the current model.
    // It must NOT be suppressed as a placeholder (regression: the chip would
    // otherwise show no model for a session genuinely running on 'default').
    expect(resolveEffectiveAcpModel({ runtimeId: "default" })).toBe("default");
    expect(
      resolveEffectiveAcpModel({ runtimeName: "Default (recommended)" }),
    ).toBe("Default (recommended)");
  });

  it("follows the runtime → configured → sdkLlm precedence", () => {
    expect(
      resolveEffectiveAcpModel({
        runtimeName: "Sonnet",
        runtimeId: "sonnet",
        configured: "haiku",
      }),
    ).toBe("Sonnet");
    expect(resolveEffectiveAcpModel({ configured: "haiku" })).toBe("haiku");
    expect(resolveEffectiveAcpModel({ sdkLlm: "gpt-5.5/medium" })).toBe(
      "gpt-5.5/medium",
    );
  });

  it("still suppresses the legacy acp-managed sentinel and blanks", () => {
    expect(
      resolveEffectiveAcpModel({ sdkLlm: ACP_MANAGED_SENTINEL }),
    ).toBeNull();
    expect(resolveEffectiveAcpModel({ runtimeId: "   " })).toBeNull();
    expect(resolveEffectiveAcpModel({})).toBeNull();
  });

  it("falls back to providerDefault only when no concrete model resolves", () => {
    expect(
      resolveEffectiveAcpModel({
        sdkLlm: ACP_MANAGED_SENTINEL,
        providerDefault: "opus[1m]",
      }),
    ).toBe("opus[1m]");
    // A real 'default' wins over providerDefault — it is a concrete model.
    expect(
      resolveEffectiveAcpModel({
        runtimeId: "default",
        providerDefault: "opus[1m]",
      }),
    ).toBe("default");
  });
});

describe("getAllAcpReservedSecretNames", () => {
  it("covers every built-in provider's env-keyed credential names", () => {
    const names = getAllAcpReservedSecretNames();
    // API keys + base URLs from the SDK registry.
    expect(names.has("ANTHROPIC_API_KEY")).toBe(true);
    expect(names.has("ANTHROPIC_BASE_URL")).toBe(true);
    // Per-provider container/subscription/Vertex credentials.
    expect(names.has("CLAUDE_CODE_OAUTH_TOKEN")).toBe(true);
    expect(names.has("CODEX_AUTH_JSON")).toBe(true);
    expect(names.has("GOOGLE_APPLICATION_CREDENTIALS_JSON")).toBe(true);
    expect(names.has("GOOGLE_CLOUD_PROJECT")).toBe(true);
  });

  it("does not include unrelated global secret names", () => {
    const names = getAllAcpReservedSecretNames();
    expect(names.has("MY_CUSTOM_TOOL_TOKEN")).toBe(false);
  });
});
