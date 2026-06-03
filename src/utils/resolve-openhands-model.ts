import { OPENHANDS_LLM_PROXY_BASE_URL } from "#/utils/openhands-llm";

const MODELS_TIMEOUT_MS = 10000;
const PROVIDER_DEFAULT_BASE_URLS: Partial<Record<string, string>> = {
  openhands: OPENHANDS_LLM_PROXY_BASE_URL,
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const toModelId = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  const record = asRecord(value);
  if (!record) return null;
  const id = record.id;
  if (typeof id === "string" && id.trim()) return id.trim();
  const model = record.model;
  if (typeof model === "string" && model.trim()) return model.trim();
  return null;
};

export const parseModelIdsFromModelsResponse = (payload: unknown): string[] => {
  const record = asRecord(payload);
  if (!record) return [];

  const data = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : null;

  if (!data) return [];

  const unique = new Set<string>();
  data.forEach((item) => {
    const modelId = toModelId(item);
    if (modelId) unique.add(modelId);
  });

  return Array.from(unique);
};

export const chooseOpenHandsFallbackModel = (
  requestedModel: string,
  availableModels: string[],
): string | null => {
  if (availableModels.includes(requestedModel)) {
    return requestedModel;
  }

  const caseInsensitiveMatch = availableModels.find(
    (model) => model.toLowerCase() === requestedModel.toLowerCase(),
  );
  if (caseInsensitiveMatch) {
    return caseInsensitiveMatch;
  }

  const datedMatches = availableModels
    .filter((model) => model.startsWith(`${requestedModel}-`))
    .sort((a, b) => b.localeCompare(a));

  return datedMatches[0] ?? null;
};

const buildModelsUrl = (baseUrl: string): URL | null => {
  try {
    const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const parsed = new URL(normalized);
    const hasV1Suffix = parsed.pathname.replace(/\/+$/, "").endsWith("/v1");
    return hasV1Suffix
      ? new URL("models", parsed)
      : new URL("v1/models", parsed);
  } catch {
    return null;
  }
};

export const resolveOpenHandsModelForApiKey = async ({
  provider,
  requestedModel,
  apiKey,
  baseUrl,
  fetcher = fetch,
}: {
  provider: string;
  requestedModel: string;
  apiKey: string;
  baseUrl?: string | null;
  fetcher?: typeof fetch;
}): Promise<string> => {
  const trimmedModel = requestedModel.trim();
  const trimmedApiKey = apiKey.trim();
  if (!trimmedModel || !trimmedApiKey) {
    return requestedModel;
  }

  const providerBaseUrl =
    baseUrl?.trim() || PROVIDER_DEFAULT_BASE_URLS[provider]?.trim();
  if (!providerBaseUrl) {
    return requestedModel;
  }

  const modelsUrl = buildModelsUrl(providerBaseUrl);
  if (!modelsUrl) return requestedModel;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);

  try {
    const response = await fetcher(modelsUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${trimmedApiKey}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return requestedModel;
    }

    const payload = await response.json();
    const modelIds = parseModelIdsFromModelsResponse(payload);
    const fallbackModel = chooseOpenHandsFallbackModel(trimmedModel, modelIds);
    return fallbackModel ?? requestedModel;
  } catch {
    return requestedModel;
  } finally {
    clearTimeout(timeout);
  }
};
