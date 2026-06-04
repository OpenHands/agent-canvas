import { describe, it, expect } from "vitest";
import {
  enhanceErrorMessage,
  getErrorTitle,
} from "#/utils/enhance-error-message";

describe("enhanceErrorMessage", () => {
  describe("LiteLLM authentication errors", () => {
    it("should detect and enhance LiteLLM proxy authentication error", () => {
      const errorMessage =
        "litellm.AuthenticationError: AuthenticationError: Litellm_proxyException - Authentication Error, Invalid proxy server token passed. Received API Key = sk-...qI79, Key Hash (Token) =1651e598061f179b5485b9966fbf7343bd56d03c4fb36430e7c56f3151ff03c3. Unable to find token in cache or `LiteLLM_VerificationTokenTable`";

      const result = enhanceErrorMessage(errorMessage);

      expect(result.isAuthError).toBe(true);
      expect(result.message).toContain("Authentication failed");
      expect(result.message).toContain("API credentials");
      expect(result.message).toContain("Refresh your browser");
      expect(result.suggestedActions).toContain("refresh");
      expect(result.suggestedActions).toContain("check-api-key");
    });

    it("should detect authentication error from error code", () => {
      const result = enhanceErrorMessage(
        "Some error message",
        "AuthenticationError",
      );

      expect(result.isAuthError).toBe(true);
      expect(result.message).toContain("Authentication failed");
    });

    it("should detect error with 'Invalid proxy server token' pattern", () => {
      const result = enhanceErrorMessage("Invalid proxy server token passed");

      expect(result.isAuthError).toBe(true);
      expect(result.message).toContain("Authentication failed");
    });

    it("should detect error with 'Unable to find token in cache' pattern", () => {
      const result = enhanceErrorMessage(
        "Unable to find token in cache or verification table",
      );

      expect(result.isAuthError).toBe(true);
    });
  });

  describe("API key errors", () => {
    it("should detect and enhance general API key errors", () => {
      const result = enhanceErrorMessage("API key is invalid or expired");

      expect(result.isAuthError).toBe(true);
      expect(result.message).toContain("API Key Error");
      expect(result.message).toContain("Settings → LLM Configuration");
      expect(result.suggestedActions).toContain("check-settings");
    });

    it("should detect API key error from error code", () => {
      const result = enhanceErrorMessage(
        "Some error message",
        "APIKeyError",
      );

      expect(result.isAuthError).toBe(true);
      expect(result.message).toContain("API Key Error");
    });

    it("should detect authentication failed pattern", () => {
      const result = enhanceErrorMessage("Authentication failed for the request");

      expect(result.isAuthError).toBe(true);
    });
  });

  describe("non-authentication errors", () => {
    it("should return original message for unknown errors", () => {
      const originalMessage = "Some random error occurred";
      const result = enhanceErrorMessage(originalMessage);

      expect(result.isAuthError).toBe(false);
      expect(result.message).toBe(originalMessage);
      expect(result.suggestedActions).toBeUndefined();
    });

    it("should not enhance errors without auth patterns", () => {
      const result = enhanceErrorMessage("Network timeout error");

      expect(result.isAuthError).toBe(false);
      expect(result.message).toBe("Network timeout error");
    });
  });
});

describe("getErrorTitle", () => {
  it("should return 'Authentication Failed' for AuthenticationError code", () => {
    const title = getErrorTitle("AuthenticationError");
    expect(title).toBe("Authentication Failed");
  });

  it("should return 'Invalid API Key' for APIKeyError code", () => {
    const title = getErrorTitle("APIKeyError");
    expect(title).toBe("Invalid API Key");
  });

  it("should return 'Invalid API Key' for InvalidAPIKey code", () => {
    const title = getErrorTitle("InvalidAPIKey");
    expect(title).toBe("Invalid API Key");
  });

  it("should detect authentication error from message", () => {
    const title = getErrorTitle(
      undefined,
      "Litellm_proxyException - Authentication Error",
    );
    expect(title).toBe("Authentication Failed");
  });

  it("should format camelCase error codes", () => {
    const title = getErrorTitle("NetworkTimeoutError");
    expect(title).toBe("Network Timeout Error");
  });

  it("should return 'Error' as fallback", () => {
    const title = getErrorTitle(undefined, "Some message");
    expect(title).toBe("Error");
  });
});
