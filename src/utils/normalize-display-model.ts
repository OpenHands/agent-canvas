import { isOpenHandsProxyBaseUrl } from "#/utils/openhands-llm";

const LITELLM_PROXY_PREFIX = "litellm_proxy/";

/**
 * Reverse the SDK's `openhands/* -> litellm_proxy/*` rewrite for display.
 *
 * The agent-server's LLM validator stores curated OpenHands models as
 * `litellm_proxy/<m>` against the All-Hands proxy base URL. Without
 * normalization the GUI re-loads such settings as `litellm_proxy`, so the
 * provider dropdown silently switches off "OpenHands" after every save.
 */
export function normalizeDisplayModel(
  rawModel: string | null | undefined,
  baseUrl: string | null | undefined,
  openhandsVerifiedModels: readonly string[],
): string {
  if (!rawModel) return "";
  if (!rawModel.startsWith(LITELLM_PROXY_PREFIX)) return rawModel;
  if (!isOpenHandsProxyBaseUrl(baseUrl)) return rawModel;
  const modelName = rawModel.slice(LITELLM_PROXY_PREFIX.length);
  if (!openhandsVerifiedModels.includes(modelName)) return rawModel;
  return `openhands/${modelName}`;
}
