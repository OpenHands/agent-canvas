import { describe, expect, it } from "vitest";
import {
  OPENHANDS_LLM_PROXY_BASE_URL,
  isOpenHandsProviderModel,
} from "#/utils/openhands-llm";

describe("openhands LLM helpers", () => {
  it("identifies OpenHands provider model ids", () => {
    expect(isOpenHandsProviderModel("openhands/gpt-5.5")).toBe(true);
    expect(isOpenHandsProviderModel("litellm_proxy/gpt-5.5")).toBe(false);
    expect(isOpenHandsProviderModel("openai/gpt-4o")).toBe(false);
    expect(isOpenHandsProviderModel(null)).toBe(false);
  });

  it("exports the All-Hands LiteLLM proxy base URL", () => {
    expect(OPENHANDS_LLM_PROXY_BASE_URL).toBe(
      "https://llm-proxy.app.all-hands.dev/",
    );
  });
});
