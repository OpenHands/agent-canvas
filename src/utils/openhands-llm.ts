export const OPENHANDS_LLM_PROXY_BASE_URL =
  "https://llm-proxy.app.all-hands.dev/";

export function isOpenHandsProviderModel(model: unknown): model is string {
  return typeof model === "string" && model.startsWith("openhands/");
}
