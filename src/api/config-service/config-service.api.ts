import { LLMMetadataClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "../agent-server-client-options";
import type {
  LLMModel,
  LLMModelPage,
  LLMProvider,
  ProviderPage,
  SearchModelsParams,
  SearchProvidersParams,
} from "./config-service.types";

function filterByQuery<T extends { name: string }>(
  items: T[],
  query?: string,
): T[] {
  if (!query) {
    return items;
  }

  const normalizedQuery = query.toLowerCase();
  return items.filter((item) =>
    item.name.toLowerCase().includes(normalizedQuery),
  );
}

function filterByVerified<T extends { verified: boolean }>(
  items: T[],
  verified?: boolean,
): T[] {
  if (verified === undefined) {
    return items;
  }

  return items.filter((item) => item.verified === verified);
}

function limitItems<T>(items: T[], limit?: number): T[] {
  if (!limit || limit <= 0) {
    return items;
  }

  return items.slice(0, limit);
}

class ConfigService {
  static async searchModels(
    params: SearchModelsParams = {},
    verifiedByProvider?: Record<string, string[]>,
  ): Promise<LLMModelPage> {
    const llmClient = new LLMMetadataClient(getAgentServerClientOptions());
    const verifiedFetch =
      verifiedByProvider !== undefined
        ? Promise.resolve(verifiedByProvider)
        : llmClient.getVerifiedModels();
    const [models, verifiedMap] = await Promise.all([
      llmClient.getModels(),
      verifiedFetch,
    ]);

    const provider = params.provider__eq ?? null;
    const verifiedNames = new Set(
      provider ? (verifiedMap?.[provider] ?? []) : [],
    );
    const verifiedItems: LLMModel[] = [...verifiedNames].map((name) => ({
      provider,
      name,
      verified: true,
    }));

    const prefixedItems: LLMModel[] = provider
      ? (models ?? [])
          .filter((model) => model.startsWith(`${provider}/`))
          .map((model) => model.slice(provider.length + 1))
          .filter((name) => name.length > 0 && !verifiedNames.has(name))
          .map((name) => ({
            provider,
            name,
            verified: false,
          }))
      : [];

    const items = limitItems(
      filterByVerified(
        filterByQuery([...verifiedItems, ...prefixedItems], params.query),
        params.verified__eq,
      ),
      params.limit,
    );

    return {
      items,
      next_page_id: null,
    };
  }

  static async searchProviders(
    params: SearchProvidersParams = {},
    verifiedByProvider?: Record<string, string[]>,
  ): Promise<ProviderPage> {
    const llmClient = new LLMMetadataClient(getAgentServerClientOptions());
    const verifiedFetch =
      verifiedByProvider !== undefined
        ? Promise.resolve(verifiedByProvider)
        : llmClient.getVerifiedModels();
    const [providers, verifiedMap] = await Promise.all([
      llmClient.getProviders(),
      verifiedFetch,
    ]);

    const verifiedProviders = new Set(Object.keys(verifiedMap ?? {}));
    const names = new Set<string>([...verifiedProviders, ...(providers ?? [])]);
    const providerItems: LLMProvider[] = [...names].map((name) => ({
      name,
      verified: verifiedProviders.has(name),
    }));

    const items = limitItems(
      filterByVerified(
        filterByQuery(providerItems, params.query),
        params.verified__eq,
      ),
      params.limit,
    );

    return {
      items,
      next_page_id: null,
    };
  }
}

export default ConfigService;
