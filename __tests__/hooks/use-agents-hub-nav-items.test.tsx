import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentsHubNavItems } from "#/hooks/use-agents-hub-nav-items";
import { WebClientConfig } from "#/api/option-service/option.types";
import { I18nKey } from "#/i18n/declaration";

const useConfigMock = vi.fn();
const useActiveBackendMock = vi.fn<
  () => { backend: { kind: "local" | "cloud" }; orgId: string | null }
>(() => ({ backend: { kind: "local" }, orgId: null }));

vi.mock("#/hooks/query/use-config", () => ({
  useConfig: () => useConfigMock(),
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

const itemPaths = (items: ReturnType<typeof useAgentsHubNavItems>) =>
  items
    .filter((i) => i.type === "item")
    .map((i) => (i.type === "item" ? i.item.to : null));

describe("useAgentsHubNavItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useActiveBackendMock.mockReturnValue({
      backend: { kind: "local" },
      orgId: null,
    });
  });

  it("lists the profile library plus building-block catalogs under /agents", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });

    const paths = itemPaths(
      renderHook(() => useAgentsHubNavItems()).result.current,
    );
    expect(paths).toEqual([
      "/agents/profiles",
      "/agents/llm",
      "/agents/mcp",
      "/agents/skills",
      "/agents/plugins",
      "/agents/secrets",
    ]);
  });

  it("groups the nav with Profiles + Building blocks headers", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });

    const headers = renderHook(() => useAgentsHubNavItems())
      .result.current.filter((i) => i.type === "header")
      .map((i) => (i.type === "header" ? i.text : null));
    expect(headers).toEqual([
      I18nKey.SETTINGS$AGENTS_HUB_PROFILES_HEADER,
      I18nKey.SETTINGS$AGENTS_HUB_BUILDING_BLOCKS_HEADER,
    ]);
  });

  it("renames LLM to LLM Profiles on local backends", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });

    const llm = renderHook(() => useAgentsHubNavItems()).result.current.find(
      (i) => i.type === "item" && i.item.to === "/agents/llm",
    );
    expect(llm?.type === "item" && llm.item.text).toBe(
      I18nKey.SETTINGS$LLM_PROFILES,
    );
  });

  it("keeps the generic LLM label on cloud backends", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });
    useActiveBackendMock.mockReturnValue({
      backend: { kind: "cloud" },
      orgId: "org-1",
    });

    const llm = renderHook(() => useAgentsHubNavItems()).result.current.find(
      (i) => i.type === "item" && i.item.to === "/agents/llm",
    );
    expect(llm?.type === "item" && llm.item.text).toBe("SETTINGS$NAV_LLM");
  });

  it("hides the LLM catalog when hide_llm_settings is set", () => {
    useConfigMock.mockReturnValue({
      data: createConfig({ hide_llm_settings: true }),
    });

    expect(
      itemPaths(renderHook(() => useAgentsHubNavItems()).result.current),
    ).not.toContain("/agents/llm");
  });
});
