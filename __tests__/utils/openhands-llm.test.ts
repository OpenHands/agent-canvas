import { describe, expect, it } from "vitest";
import {
  OPENHANDS_LLM_PROXY_BASE_URL,
  isOpenHandsProxyBaseUrl,
} from "#/utils/openhands-llm";

describe("openhands LLM helpers", () => {
  it("exports the All-Hands LiteLLM proxy base URL", () => {
    expect(OPENHANDS_LLM_PROXY_BASE_URL).toBe(
      "https://llm-proxy.app.all-hands.dev/",
    );
  });

  it("recognizes the All-Hands proxy base URL regardless of trailing slash or /v1", () => {
    expect(isOpenHandsProxyBaseUrl(OPENHANDS_LLM_PROXY_BASE_URL)).toBe(true);
    expect(isOpenHandsProxyBaseUrl("https://llm-proxy.app.all-hands.dev")).toBe(
      true,
    );
    expect(
      isOpenHandsProxyBaseUrl("https://llm-proxy.app.all-hands.dev/v1"),
    ).toBe(true);
    expect(isOpenHandsProxyBaseUrl("https://other-proxy.example.com")).toBe(
      false,
    );
    expect(isOpenHandsProxyBaseUrl(null)).toBe(false);
    expect(isOpenHandsProxyBaseUrl(undefined)).toBe(false);
  });
});
