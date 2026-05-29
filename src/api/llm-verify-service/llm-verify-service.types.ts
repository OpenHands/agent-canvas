/**
 * Wire types for the agent-server's `POST /api/llm/verify` endpoint, which
 * runs a credentials/connectivity probe against the configured LLM provider
 * and returns a discriminated status.
 *
 * Keep this file in sync with `VerifyLLMStatus` / `VerifyLLMRequest` /
 * `VerifyLLMResponse` in
 * `openhands-agent-server/openhands/agent_server/llm_router.py`.
 */

/**
 * Outcome categories surfaced by `POST /llm/verify`. The endpoint always
 * returns HTTP 200; callers branch on `status`.
 *
 * Allow-save semantics by status:
 *   - `success` / `rate_limited` → credentials are valid, save unblocked.
 *     (rate_limited is reported separately so the UI can warn the user
 *     that their key is throttled, but the key itself works.)
 *   - `auth_error` / `bad_request` → block save; user must fix.
 *   - `timeout` / `unreachable` / `unknown_error` → indeterminate; offer
 *     a "Save anyway" affordance.
 */
export type VerifyLlmStatus =
  | "success"
  | "auth_error"
  | "rate_limited"
  | "timeout"
  | "unreachable"
  | "bad_request"
  | "unknown_error";

/** Request body for `POST /api/llm/verify`. */
export interface VerifyLlmRequest {
  model: string;
  api_key?: string;
  base_url?: string;
  api_version?: string;
  aws_region_name?: string;
  aws_access_key_id?: string;
  aws_secret_access_key?: string;
  aws_session_token?: string;
  aws_profile_name?: string;
  aws_bedrock_runtime_endpoint?: string;
}

/** Response body for `POST /api/llm/verify`. */
export interface VerifyLlmResponse {
  status: VerifyLlmStatus;
  /** Human-readable detail from the provider, if available. */
  message?: string | null;
  /** LiteLLM provider name inferred from model + base_url. */
  provider?: string | null;
}

/**
 * Sentinel returned by the service layer when the connected agent-server is
 * older than the one that ships `POST /api/llm/verify` (HTTP 404).
 *
 * The UI degrades gracefully on this — verification is skipped silently and
 * the save proceeds as if verification had not been attempted. Old servers
 * are still usable; we just can't pre-flight credentials against them.
 */
export const VERIFY_ENDPOINT_MISSING = "endpoint_missing" as const;
export type VerifyEndpointMissing = typeof VERIFY_ENDPOINT_MISSING;

/** Discriminated result returned by `LlmVerifyService.verify`. */
export type VerifyLlmResult =
  | VerifyLlmResponse
  | { status: VerifyEndpointMissing };

export function isEndpointMissing(
  result: VerifyLlmResult,
): result is { status: VerifyEndpointMissing } {
  return result.status === VERIFY_ENDPOINT_MISSING;
}
