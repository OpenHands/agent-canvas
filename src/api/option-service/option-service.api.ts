import { loadAgentServerInfo } from "../agent-server-compatibility";
import { createLlmMetadataClient } from "../typescript-client";
import { ModelsResponse, WebClientConfig } from "./option.types";

class OptionService {
  static async getModels(): Promise<ModelsResponse> {
    const llmClient = createLlmMetadataClient();
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

  static async getSecurityAnalyzers(): Promise<string[]> {
    return ["llm", "pattern", "policy_rail"];
  }

  static async getConfig(): Promise<WebClientConfig> {
    await loadAgentServerInfo();

    return {
      posthog_client_key: null,
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
