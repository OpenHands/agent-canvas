import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsNavItems } from "#/hooks/use-settings-nav-items";
import { WebClientConfig } from "#/api/option-service/option.types";

const useConfigMock = vi.fn();

vi.mock("#/hooks/query/use-config", () => ({
  useConfig: () => useConfigMock(),
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

const settingsPaths = (
  items: ReturnType<typeof useSettingsNavItems>,
): (string | null)[] =>
  items
    .filter((item) => item.type === "item")
    .map((item) => (item.type === "item" ? item.item.to : null));

describe("useSettingsNavItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shrinks to cross-cutting items only — Application (#1456)", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });

    const { result } = renderHook(() => useSettingsNavItems());

    expect(settingsPaths(result.current)).toEqual(["/settings/app"]);
  });

  it("no longer lists agent config — it moved to the Agents hub", () => {
    useConfigMock.mockReturnValue({ data: createConfig() });

    const paths = settingsPaths(
      renderHook(() => useSettingsNavItems()).result.current,
    );
    for (const moved of [
      "/settings/agent",
      "/settings/agents",
      "/settings/llm",
      "/settings/condenser",
      "/settings/verification",
      "/settings/secrets",
    ]) {
      expect(paths).not.toContain(moved);
    }
  });

  it("keeps Application available even when LLM settings are hidden", () => {
    useConfigMock.mockReturnValue({
      data: createConfig({ hide_llm_settings: true }),
    });

    expect(
      settingsPaths(renderHook(() => useSettingsNavItems()).result.current),
    ).toEqual(["/settings/app"]);
  });
});
