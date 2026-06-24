import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientLoader } from "#/routes/agents-hub";
import OptionService from "#/api/option-service/option-service.api";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { getFirstAvailableAgentsPath } from "#/utils/settings-utils";
import { queryClient } from "#/query-client-config";

const config = (hideLlm: boolean) => ({
  posthog_client_key: null,
  feature_flags: {
    hide_llm_settings: hideLlm,
    hide_users_page: true,
  },
  providers_configured: [],
  maintenance_start_time: null,
  recaptcha_site_key: null,
  faulty_models: [],
  error_message: null,
  updated_at: new Date().toISOString(),
});

const runLoader = (pathname: string) =>
  clientLoader({
    request: new Request(`http://localhost${pathname}`),
    params: {},
    context: {},
  } as never);

describe("agents hub route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    __resetActiveStoreForTests();
    queryClient.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
    queryClient.clear();
  });

  it("getFirstAvailableAgentsPath is the always-available Profiles page", () => {
    // Profiles is never feature-flagged off, so it is the safe fallback.
    expect(getFirstAvailableAgentsPath()).toBe("/agents/profiles");
  });

  it("redirects a hidden LLM page to the first available agents path", async () => {
    vi.spyOn(OptionService, "getConfig").mockResolvedValue(config(true));

    const response = (await runLoader("/agents/llm")) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/agents/profiles");
  });

  it("does not redirect the LLM page when it is visible", async () => {
    vi.spyOn(OptionService, "getConfig").mockResolvedValue(config(false));

    const result = await runLoader("/agents/llm");

    expect(result).toBeNull();
  });

  it("does not redirect a non-hidden page even when LLM is hidden", async () => {
    vi.spyOn(OptionService, "getConfig").mockResolvedValue(config(true));

    const result = await runLoader("/agents/mcp");

    expect(result).toBeNull();
  });
});
