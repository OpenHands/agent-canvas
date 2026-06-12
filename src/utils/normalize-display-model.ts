import { isOpenHandsProxyBaseUrl } from "#/utils/openhands-llm";

const LITELLM_PROXY_PREFIX = "litellm_proxy/";

/**
 * True for legacy pre-#3548 OpenHands settings that were persisted with the
 * LiteLLM proxy model and All-Hands proxy URL instead of the public
 * `openhands/*` model ID.
 */
export function needsLegacyOpenHandsDisplayNormalization(
  rawModel: string | null | undefined,
  baseUrl: string | null | undefined,
): boolean {
  return Boolean(
    rawModel?.startsWith(LITELLM_PROXY_PREFIX) &&
    isOpenHandsProxyBaseUrl(baseUrl),
  );
}

/**
 * Normalize legacy persisted `litellm_proxy/<m>` + All-Hands proxy settings
 * back to the public `openhands/<m>` model ID for display. Current SDK
 * versions should already return `openhands/*` from settings/profile APIs;
 * this compatibility path keeps older saved configs readable.
 */
export function normalizeDisplayModel(
  rawModel: string | null | undefined,
  baseUrl: string | null | undefined,
  openhandsVerifiedModels: readonly string[],
): string {
  if (!rawModel) return "";
  if (!needsLegacyOpenHandsDisplayNormalization(rawModel, baseUrl)) {
    return rawModel;
  }
  const modelName = rawModel.slice(LITELLM_PROXY_PREFIX.length);
  if (!openhandsVerifiedModels.includes(modelName)) return rawModel;
  return `openhands/${modelName}`;
}
