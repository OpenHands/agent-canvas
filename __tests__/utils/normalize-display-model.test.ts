import { describe, expect, it } from "vitest";
import { normalizeDisplayModel } from "#/utils/normalize-display-model";

const OPENHANDS_VERIFIED = ["claude-opus-4-7", "gpt-5.5"];
const OPENHANDS_PROXY_BASE_URL = "https://llm-proxy.app.all-hands.dev/";

describe("normalizeDisplayModel", () => {
  it("rewrites litellm_proxy/<m> to openhands/<m> when the base URL is the All-Hands proxy and the model is in the openhands verified list", () => {
    // Arrange — mirrors the SDK round-trip: openhands/<m> on save becomes
    // litellm_proxy/<m> on disk plus the All-Hands proxy base URL.
    const persistedModel = "litellm_proxy/claude-opus-4-7";

    // Act
    const result = normalizeDisplayModel(
      persistedModel,
      OPENHANDS_PROXY_BASE_URL,
      OPENHANDS_VERIFIED,
    );

    // Assert
    expect(result).toBe("openhands/claude-opus-4-7");
  });

  it("leaves litellm_proxy/<m> untouched when the base URL is not the All-Hands proxy", () => {
    // Arrange — a user-configured litellm_proxy pointed at a non-OpenHands
    // gateway must not be re-labelled as OpenHands.
    const persistedModel = "litellm_proxy/claude-opus-4-7";

    // Act
    const result = normalizeDisplayModel(
      persistedModel,
      "https://other-proxy.example.com/",
      OPENHANDS_VERIFIED,
    );

    // Assert
    expect(result).toBe("litellm_proxy/claude-opus-4-7");
  });
});
