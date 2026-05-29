import { describe, it, expect } from "vitest";
import {
  deriveProfileRuntimePlan,
  normalizeLlmProfile,
  type AgentProfile,
  type ConversationRuntimeContext,
} from "#/utils/agent-profiles/runtime-plan";

const openHandsProfile = (
  overrides: Partial<Extract<AgentProfile, { kind: "openhands" }>> = {},
): AgentProfile => ({
  kind: "openhands",
  name: "profile",
  llm: { model: "anthropic/claude-haiku", baseUrl: null },
  ...overrides,
});

const acpProfile = (
  overrides: Partial<Extract<AgentProfile, { kind: "acp" }>> = {},
): AgentProfile => ({
  kind: "acp",
  name: "acp-profile",
  acpServer: "claude-code",
  acpModel: "claude-opus-4-7",
  acpCommand: ["npx", "claude-code-acp"],
  acpArgs: [],
  acpEnv: {},
  ...overrides,
});

const openHandsContext = (
  overrides: Partial<Extract<ConversationRuntimeContext, { kind: "openhands" }>> = {},
): ConversationRuntimeContext => ({
  kind: "openhands",
  llm: { model: "anthropic/claude-haiku", baseUrl: null },
  ...overrides,
});

const acpContext = (
  overrides: Partial<Extract<ConversationRuntimeContext, { kind: "acp" }>> = {},
): ConversationRuntimeContext => ({
  kind: "acp",
  acpServer: "claude-code",
  acpModel: "claude-opus-4-7",
  acpCommand: ["npx", "claude-code-acp"],
  acpArgs: [],
  acpEnv: {},
  providerSupportsRuntimeSwitch: true,
  sessionInitialized: true,
  ...overrides,
});

describe("deriveProfileRuntimePlan", () => {
  it("returns current when the profile is the active one", () => {
    const plan = deriveProfileRuntimePlan({
      profile: openHandsProfile({ llm: { model: "other", baseUrl: null } }),
      context: openHandsContext(),
      isActive: true,
    });
    expect(plan).toEqual({ action: "current" });
  });

  it("disables an OpenHands profile against an ACP conversation (different kind)", () => {
    const plan = deriveProfileRuntimePlan({
      profile: openHandsProfile(),
      context: acpContext(),
    });
    expect(plan).toEqual({
      action: "disabled",
      reason: "different-agent-kind",
    });
  });

  it("disables an ACP profile against an OpenHands conversation (different kind)", () => {
    const plan = deriveProfileRuntimePlan({
      profile: acpProfile(),
      context: openHandsContext(),
    });
    expect(plan).toEqual({
      action: "disabled",
      reason: "different-agent-kind",
    });
  });

  describe("OpenHands -> OpenHands", () => {
    it("switches live when only the model differs", () => {
      const plan = deriveProfileRuntimePlan({
        profile: openHandsProfile({ llm: { model: "openai/gpt-4o", baseUrl: null } }),
        context: openHandsContext(),
      });
      expect(plan).toEqual({ action: "switch-live", mutableFields: ["llm"] });
    });

    it("switches live when only the base_url differs", () => {
      const plan = deriveProfileRuntimePlan({
        profile: openHandsProfile({
          llm: { model: "anthropic/claude-haiku", baseUrl: "https://proxy" },
        }),
        context: openHandsContext(),
      });
      expect(plan).toEqual({ action: "switch-live", mutableFields: ["llm"] });
    });

    it("is current when model and base_url match and it is the active profile", () => {
      const plan = deriveProfileRuntimePlan({
        profile: openHandsProfile(),
        context: openHandsContext(),
        isActive: true,
      });
      expect(plan).toEqual({ action: "current" });
    });

    it("treats an identical non-active profile as current (a no-op switch)", () => {
      const plan = deriveProfileRuntimePlan({
        profile: openHandsProfile(),
        context: openHandsContext(),
      });
      expect(plan).toEqual({ action: "current" });
    });

    it("disables when condenser settings differ", () => {
      const plan = deriveProfileRuntimePlan({
        profile: openHandsProfile({ nonRuntime: { condenser: "summary" } }),
        context: openHandsContext(),
      });
      expect(plan).toEqual({
        action: "disabled",
        reason: "non-runtime-settings-differ",
      });
    });

    it("disables with its own reason when verification differs", () => {
      const plan = deriveProfileRuntimePlan({
        profile: openHandsProfile({ nonRuntime: { verification: "strict" } }),
        context: openHandsContext(),
      });
      expect(plan).toEqual({
        action: "disabled",
        reason: "verification-not-runtime-switchable",
      });
    });

    it("prioritizes a non-runtime difference over a switchable model difference", () => {
      const plan = deriveProfileRuntimePlan({
        profile: openHandsProfile({
          llm: { model: "openai/gpt-4o", baseUrl: null },
          nonRuntime: { mcp: "github" },
        }),
        context: openHandsContext(),
      });
      expect(plan).toEqual({
        action: "disabled",
        reason: "non-runtime-settings-differ",
      });
    });
  });

  describe("ACP -> ACP", () => {
    it("switches live when only acp_model differs", () => {
      const plan = deriveProfileRuntimePlan({
        profile: acpProfile({ acpModel: "claude-sonnet-4-6" }),
        context: acpContext(),
      });
      expect(plan).toEqual({
        action: "switch-live",
        mutableFields: ["acp_model"],
      });
    });

    it("is current when the model matches and it is the active profile", () => {
      const plan = deriveProfileRuntimePlan({
        profile: acpProfile(),
        context: acpContext(),
        isActive: true,
      });
      expect(plan).toEqual({ action: "current" });
    });

    it("disables when the ACP provider differs", () => {
      const plan = deriveProfileRuntimePlan({
        profile: acpProfile({ acpServer: "codex" }),
        context: acpContext(),
      });
      expect(plan).toEqual({
        action: "disabled",
        reason: "different-acp-provider",
      });
    });

    it("disables when the launch command differs", () => {
      const plan = deriveProfileRuntimePlan({
        profile: acpProfile({ acpCommand: ["npx", "other"] }),
        context: acpContext(),
      });
      expect(plan).toEqual({
        action: "disabled",
        reason: "different-acp-command",
      });
    });

    it("disables when env differs", () => {
      const plan = deriveProfileRuntimePlan({
        profile: acpProfile({ acpEnv: { API_KEY: "x" } }),
        context: acpContext(),
      });
      expect(plan).toEqual({
        action: "disabled",
        reason: "different-acp-command",
      });
    });

    it("disables when the provider has no runtime model switch", () => {
      const plan = deriveProfileRuntimePlan({
        profile: acpProfile({ acpModel: "claude-sonnet-4-6" }),
        context: acpContext({ providerSupportsRuntimeSwitch: false }),
      });
      expect(plan).toEqual({
        action: "disabled",
        reason: "provider-does-not-support-runtime-switch",
      });
    });

    it("disables when the session is not yet initialized", () => {
      const plan = deriveProfileRuntimePlan({
        profile: acpProfile({ acpModel: "claude-sonnet-4-6" }),
        context: acpContext({ sessionInitialized: false }),
      });
      expect(plan).toEqual({
        action: "disabled",
        reason: "session-not-initialized",
      });
    });
  });
});

describe("normalizeLlmProfile", () => {
  it("maps an LLM-only ProfileInfo to an OpenHands AgentProfile", () => {
    expect(
      normalizeLlmProfile({
        name: "gpt",
        model: "openai/gpt-4o",
        base_url: "https://proxy",
        api_key_set: true,
      }),
    ).toEqual({
      kind: "openhands",
      name: "gpt",
      llm: { model: "openai/gpt-4o", baseUrl: "https://proxy" },
    });
  });

  it("defaults missing model and base_url to null", () => {
    expect(
      normalizeLlmProfile({
        name: "blank",
        model: null,
        base_url: null,
        api_key_set: false,
      }),
    ).toEqual({
      kind: "openhands",
      name: "blank",
      llm: { model: null, baseUrl: null },
    });
  });

  it("maps a kind=acp ProfileInfo to an ACP AgentProfile (provider + model)", () => {
    expect(
      normalizeLlmProfile({
        name: "Local Codex",
        kind: "acp",
        model: "gpt-5-codex",
        base_url: null,
        acp_server: "codex",
        acp_model: "gpt-5-codex",
        api_key_set: true,
      }),
    ).toEqual({
      kind: "acp",
      name: "Local Codex",
      acpServer: "codex",
      acpModel: "gpt-5-codex",
    });
  });
});
