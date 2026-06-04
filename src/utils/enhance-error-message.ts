/**
 * Enhances error messages to provide user-friendly, actionable guidance.
 * Specifically handles LiteLLM authentication errors and other common issues.
 */

interface EnhancedErrorResult {
  message: string;
  isAuthError: boolean;
  suggestedActions?: string[];
}

/**
 * Checks if an error is a LiteLLM authentication error
 */
function isLiteLLMAuthError(errorMessage: string, errorCode?: string): boolean {
  if (errorCode === "AuthenticationError") {
    return true;
  }

  const authErrorPatterns = [
    /Litellm_proxyException.*Authentication Error/i,
    /Invalid proxy server token/i,
    /Unable to find token in cache/i,
    /LiteLLM_VerificationTokenTable/i,
    /AuthenticationError.*litellm/i,
  ];

  return authErrorPatterns.some((pattern) => pattern.test(errorMessage));
}

/**
 * Checks if an error is an API key related error
 */
function isAPIKeyError(errorMessage: string, errorCode?: string): boolean {
  if (errorCode === "APIKeyError" || errorCode === "InvalidAPIKey") {
    return true;
  }

  const apiKeyPatterns = [
    /API key.*invalid/i,
    /API key.*expired/i,
    /API key.*not found/i,
    /Invalid.*API.*key/i,
    /authentication.*failed/i,
  ];

  return apiKeyPatterns.some((pattern) => pattern.test(errorMessage));
}

/**
 * Enhances error messages with user-friendly text and actionable guidance
 */
export function enhanceErrorMessage(
  errorMessage: string,
  errorCode?: string,
): EnhancedErrorResult {
  // Handle LiteLLM proxy authentication errors
  if (isLiteLLMAuthError(errorMessage, errorCode)) {
    return {
      message:
        "Authentication failed: Your API credentials appear to be invalid or expired.\n\n" +
        "This can happen if:\n" +
        "• Your API key has expired or been revoked\n" +
        "• You're logged out of OpenHands Cloud\n" +
        "• There's a temporary synchronization issue\n\n" +
        "Please try:\n" +
        "1. Refresh your browser and try again\n" +
        "2. Check your LLM settings and re-enter your API key\n" +
        "3. If using OpenHands Cloud, log out and log back in\n" +
        "4. Verify your API key is still valid with your LLM provider",
      isAuthError: true,
      suggestedActions: [
        "refresh",
        "check-api-key",
        "re-login",
        "verify-with-provider",
      ],
    };
  }

  // Handle general API key errors
  if (isAPIKeyError(errorMessage, errorCode)) {
    return {
      message:
        "API Key Error: Your LLM API key appears to be invalid or missing.\n\n" +
        "Please:\n" +
        "1. Go to Settings → LLM Configuration\n" +
        "2. Verify your API key is correct\n" +
        "3. If needed, generate a new API key from your LLM provider\n" +
        "4. Save the settings and try again",
      isAuthError: true,
      suggestedActions: ["check-settings", "update-api-key"],
    };
  }

  // Return original message if no pattern matches
  return {
    message: errorMessage,
    isAuthError: false,
  };
}

/**
 * Gets a short, user-friendly error title from an error code or message
 */
export function getErrorTitle(errorCode?: string, errorMessage?: string): string {
  if (errorCode === "AuthenticationError") {
    return "Authentication Failed";
  }

  if (errorCode === "APIKeyError" || errorCode === "InvalidAPIKey") {
    return "Invalid API Key";
  }

  if (errorMessage && isLiteLLMAuthError(errorMessage, errorCode)) {
    return "Authentication Failed";
  }

  if (errorCode) {
    // Convert camelCase or PascalCase to readable format
    return errorCode.replace(/([A-Z])/g, " $1").trim();
  }

  return "Error";
}
