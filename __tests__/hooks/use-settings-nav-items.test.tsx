import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";
import { useSettingsNavItems } from "#/hooks/use-settings-nav-items";
import { WebClientConfig } from "#/api/option-service/option.types";

const useConfigMock = vi.fn();
const useSettingsMock = vi.fn();
const useActiveBackendMock = vi.fn<
  () => { backend: { kind: "local" | "cloud" }; orgId: string | null }
>(() => ({
  backend: { kind: "local" },
  orgId: null,
}));

vi.mock("#/hooks/query/use-config", () => ({
  useConfig: () => useConfigMock(),
}));

vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => useActiveBackendMock(),
}));

const createConfig = (
  feature_flags: Partial<WebClientConfig["feature_flags"]> = {},
): WebClientConfig => ({
  posthog_client_key: null,
  feature_flags: {
    hide_llm_settings: false,
    hide_users_page: true,
    ...feature_flags,
  },
  providers_configured: [],
  maintenance_start_time: null,
  recaptcha_site_key: null,
  faulty_models: [],
  error_message: null,
  updated_at: new Date().toISOString(),
});

const openHandsSettings = {
  agent_settings: { agent_kind: "openhands" },
};

const acpClaudeCodeSettings = {
  agent_settings: { agent_kind: "acp", acp_server: "claude-code" },
};

describe("useSettingsNavItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsMock.mockReturnValue({ data: openHandsSettings });
    useActiveBackendMock.mockReturnValue({
      backend: { kind: "local" },
      orgId: null,
    });
  });

  it("returns the LLM settings item unchanged on local backends", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });

    const { result } = renderHook(() => useSettingsNavItems());
    const llmItem = result.current.find(
      (item) => item.type === "item" && item.item.to === "/settings/llm",
    );

    const baseLlm = OSS_NAV_ITEMS.find(
      (item) => item.to === "/settings/llm",
    )!;
    expect(llmItem).toEqual({
      type: "item",
      item: baseLlm,
    });
  });

  it("keeps the generic LLM settings item on cloud backends", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });
    useActiveBackendMock.mockReturnValue({
      backend: { kind: "cloud" },
      orgId: "org-123",
    });

    const { result } = renderHook(() => useSettingsNavItems());

    expect(result.current).toEqual(
      OSS_NAV_ITEMS.map((item) => ({ type: "item", item })),
    );
  });

  it("filters hidden routes from the OSS settings items", () => {
    useConfigMock.mockReturnValue({
      data: createConfig({ hide_llm_settings: true }),
    });

    const { result } = renderHook(() => useSettingsNavItems());
    const paths = result.current
      .filter((item) => item.type === "item")
      .map((item) => (item.type === "item" ? item.item.to : null));

    expect(paths).not.toContain("/settings/llm");
    expect(paths).toContain("/settings/app");
    expect(paths).toContain("/settings/secrets");
  });

  it("never lists removed settings sub-pages", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });

    const { result } = renderHook(() => useSettingsNavItems());
    const paths = result.current
      .filter((item) => item.type === "item")
      .map((item) => (item.type === "item" ? item.item.to : null));

    expect(paths).not.toContain("/settings/agent-server");
    expect(paths).not.toContain("/settings/integrations");
    expect(paths).not.toContain("/settings/skills");
    expect(paths).not.toContain("/settings/mcp");
  });

  it("disables LLM + Condenser when the active agent_kind is acp", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });
    useSettingsMock.mockReturnValue({ data: acpClaudeCodeSettings });

    const { result } = renderHook(() => useSettingsNavItems());
    const byPath = new Map(
      result.current
        .filter((item) => item.type === "item")
        .map(
          (item) =>
            [item.type === "item" ? item.item.to : "", item] as const,
        ),
    );

    const llm = byPath.get("/settings/llm");
    expect(llm?.type).toBe("item");
    if (llm?.type === "item") {
      expect(llm.disabled).toBe(true);
      expect(llm.disabledAgentName).toBe("Claude Code");
    }

    const condenser = byPath.get("/settings/condenser");
    expect(condenser?.type).toBe("item");
    if (condenser?.type === "item") {
      expect(condenser.disabled).toBe(true);
    }

    // Items without `disabledByAcp` stay enabled.
    const secrets = byPath.get("/settings/secrets");
    if (secrets?.type === "item") {
      expect(secrets.disabled).toBeUndefined();
    }

    // The agent-settings entry itself is not gated.
    const agent = byPath.get("/settings/agent");
    if (agent?.type === "item") {
      expect(agent.disabled).toBeUndefined();
    }
  });

  it("falls back to 'ACP Agent' when the saved acp_server is unknown", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });
    useSettingsMock.mockReturnValue({
      data: { agent_settings: { agent_kind: "acp", acp_server: "custom" } },
    });

    const { result } = renderHook(() => useSettingsNavItems());
    const llm = result.current.find(
      (r) => r.type === "item" && r.item.to === "/settings/llm",
    );
    if (llm?.type === "item") {
      expect(llm.disabledAgentName).toBe("ACP Agent");
    }
  });

  it("leaves all items enabled when agent_kind is openhands", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });

    const { result } = renderHook(() => useSettingsNavItems());
    for (const rendered of result.current) {
      if (rendered.type === "item") {
        expect(rendered.disabled).toBeFalsy();
      }
    }
  });
});
