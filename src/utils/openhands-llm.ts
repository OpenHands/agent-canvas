export const OPENHANDS_LLM_PROXY_BASE_URL =
  "https://llm-proxy.app.all-hands.dev/";

// Accepted spellings of the All-Hands LiteLLM proxy base URL, normalized
// without a trailing slash. Current SDK versions keep `openhands/*` models
// public/stored and use this URL only at the LiteLLM boundary; the frontend
// still recognizes it for legacy persisted proxy settings.
const OPENHANDS_LLM_PROXY_BASE_URLS = new Set([
  "https://llm-proxy.app.all-hands.dev",
  "https://llm-proxy.app.all-hands.dev/v1",
]);

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
