export const OPENHANDS_LLM_PROXY_BASE_URL =
  "https://llm-proxy.app.all-hands.dev/";

// Accepted spellings of the All-Hands LiteLLM proxy base URL, normalized
// without a trailing slash. The agent-server stores curated OpenHands models
// against one of these once its validator rewrites `openhands/*` to
// `litellm_proxy/*`.
const OPENHANDS_LLM_PROXY_BASE_URLS = new Set([
  "https://llm-proxy.app.all-hands.dev",
  "https://llm-proxy.app.all-hands.dev/v1",
]);

const LITELLM_PROXY_PREFIX = "litellm_proxy/";

export function isOpenHandsProviderModel(model: unknown): model is string {
  return typeof model === "string" && model.startsWith("openhands/");
}

/**
 * True when `baseUrl` points at the All-Hands LiteLLM proxy, ignoring any
 * trailing slash.
 */
export function isOpenHandsProxyBaseUrl(baseUrl: unknown): baseUrl is string {
  return (
    typeof baseUrl === "string" &&
    OPENHANDS_LLM_PROXY_BASE_URLS.has(baseUrl.trim().replace(/\/+$/, ""))
  );
}

/**
 * True for any OpenHands-backed model: the `openhands/*` id the GUI submits, or
 * the `litellm_proxy/*` id the SDK rewrites it to once it is paired with the
 * OpenHands proxy base URL. Both forms must keep the proxy `base_url` on save —
 * dropping it strips the api_base and silently reroutes the request to the
 * default OpenAI endpoint, leaving an unusable profile (issue #1146).
 */
export function isOpenHandsProxyModel(
  model: unknown,
  baseUrl: unknown,
): model is string {
  if (isOpenHandsProviderModel(model)) return true;
  return (
    typeof model === "string" &&
    model.startsWith(LITELLM_PROXY_PREFIX) &&
    isOpenHandsProxyBaseUrl(baseUrl)
  );
}
