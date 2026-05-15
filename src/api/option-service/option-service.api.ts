import { LLMMetadataClient } from "@openhands/typescript-client/clients";
import { PRODUCT_URL } from "#/utils/constants";
import { loadAgentServerInfo } from "../agent-server-compatibility";
import { getAgentServerClientOptions } from "../agent-server-client-options";
import { ModelsResponse, WebClientConfig } from "./option.types";

// PostHog project keys — hardcoded per deployment environment so they can
// never be accidentally changed by environment variable drift.
const POSTHOG_PROD_KEY = "phc_BgzfxKdgsYMLFTmJqt424ZoyVHvKFfrwttLimzdYTKFK";
const POSTHOG_STAGING_KEY = "phc_BgzfxKdgsYMLFTmJqt424ZoyVHvKFfrwttLimzdYTKFK"; // TODO: replace with dedicated staging project key

const PROD_HOSTNAME = new URL(PRODUCT_URL.PRODUCTION).hostname;
const STAGING_HOSTNAME = new URL(PRODUCT_URL.STAGING).hostname;

function getPosthogClientKey(): string | null {
  if (typeof window === "undefined") return null;
  const { hostname } = window.location;
  if (hostname === PROD_HOSTNAME) return POSTHOG_PROD_KEY;
  if (hostname === STAGING_HOSTNAME) return POSTHOG_STAGING_KEY;
  return null;
}

class OptionService {
  static async getModels(): Promise<ModelsResponse> {
    const llmClient = new LLMMetadataClient(getAgentServerClientOptions());
    const [models, verifiedByProvider, providers] = await Promise.all([
      llmClient.getModels(),
      llmClient.getVerifiedModels(),
      llmClient.getProviders(),
    ]);

    const verifiedProviders = Object.keys(verifiedByProvider ?? {}).sort();
    const verifiedModels = verifiedProviders.flatMap(
      (provider) => verifiedByProvider[provider] ?? [],
    );

    return {
      models: models ?? [],
      verified_models: verifiedModels,
      verified_providers:
        providers?.filter((provider) => verifiedProviders.includes(provider)) ??
        verifiedProviders,
      default_model: verifiedModels[0] ?? models?.[0] ?? "",
    };
  }

  static async getConfig(): Promise<WebClientConfig> {
    await loadAgentServerInfo();

    return {
      posthog_client_key: getPosthogClientKey(),
      feature_flags: {
        hide_llm_settings: false,
        hide_users_page: true,
      },
      providers_configured: [],
      maintenance_start_time: null,
      recaptcha_site_key: null,
      faulty_models: [],
      error_message: null,
      updated_at: new Date().toISOString(),
    };
  }
}

export default OptionService;
