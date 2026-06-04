import { describe, expect, it } from "vitest";
import {
  OPENHANDS_LLM_PROXY_BASE_URL,
  isOpenHandsProviderModel,
  isOpenHandsProxyBaseUrl,
  isOpenHandsProxyModel,
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

  it("treats both openhands/* and the SDK-rewritten litellm_proxy/* form as OpenHands-backed (issue #1146)", () => {
    // The `openhands/*` form the GUI submits — proxy is implied, base URL is
    // irrelevant.
    expect(isOpenHandsProxyModel("openhands/gpt-5.5", null)).toBe(true);
    expect(isOpenHandsProxyModel("openhands/gpt-5.5", "anything")).toBe(true);

    // The `litellm_proxy/*` form the SDK persists, paired with the proxy URL.
    expect(
      isOpenHandsProxyModel(
        "litellm_proxy/claude-opus-4-8",
        OPENHANDS_LLM_PROXY_BASE_URL,
      ),
    ).toBe(true);
    expect(
      isOpenHandsProxyModel(
        "litellm_proxy/claude-opus-4-8",
        "https://llm-proxy.app.all-hands.dev",
      ),
    ).toBe(true);
  });

  it("does not over-classify non-OpenHands models as proxy-backed", () => {
    // A litellm_proxy model pointed at a third-party gateway is not OpenHands.
    expect(
      isOpenHandsProxyModel(
        "litellm_proxy/claude-opus-4-8",
        "https://other-proxy.example.com",
      ),
    ).toBe(false);
    // An already-stranded profile (proxy URL lost) is not auto-recognized: it
    // must be re-activated/re-selected, not silently re-stamped here.
    expect(isOpenHandsProxyModel("litellm_proxy/claude-opus-4-8", null)).toBe(
      false,
    );
    // Plain providers stay plain even when oddly paired with the proxy URL.
    expect(
      isOpenHandsProxyModel("openai/gpt-4o", OPENHANDS_LLM_PROXY_BASE_URL),
    ).toBe(false);
    expect(isOpenHandsProxyModel(null, OPENHANDS_LLM_PROXY_BASE_URL)).toBe(
      false,
    );
  });
});
