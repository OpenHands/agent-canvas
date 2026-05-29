/**
 * Calls `POST /api/llm/verify` on the active agent-server to probe LLM
 * credentials before a save.
 *
 * TODO(typescript-client >= 1.24): once the upstream
 * `LLMMetadataClient` ships a typed `verifyLlmConfig` method, replace
 * this file with a one-line call through the typed client and remove the
 * `api/llm-verify-service/llm-verify-service.api.ts` entry from
 * `ALLOWED_AD_HOC_HTTP_FILES` in `no-direct-agent-server-calls.test.ts`.
 *
 * Until then, this module is the **only** place agent-canvas hits the
 * verify endpoint directly — every UI caller funnels through here via
 * `useVerifyLlm`. Keeping the surface area to a single file means the
 * eventual swap-over is a true one-file change.
 */
import axios, { AxiosError, type AxiosInstance } from "axios";
import { getAgentServerClientOptions } from "../agent-server-client-options";
import {
  VERIFY_ENDPOINT_MISSING,
  type VerifyLlmRequest,
  type VerifyLlmResponse,
  type VerifyLlmResult,
} from "./llm-verify-service.types";

const VERIFY_PATH = "/api/llm/verify";

/**
 * Verify probe timeout (ms). Generous enough to cover slow first-token
 * latency on cold-start providers (Bedrock, vertex, large Anthropic
 * models), tight enough that a stuck connection doesn't freeze the UI.
 *
 * The SDK-side `LLM.averify` does not cap its own runtime — the timeout
 * here is what bounds "verifying…" in the UI.
 */
const VERIFY_TIMEOUT_MS = 45_000;

function buildClient(): AxiosInstance {
  const { host, apiKey } = getAgentServerClientOptions();
  const instance = axios.create({
    baseURL: host,
    timeout: VERIFY_TIMEOUT_MS,
  });
  if (apiKey) {
    // Match the auth header the typed clients send so the same
    // session-API-key gating applies.
    instance.defaults.headers.common["X-Session-API-Key"] = apiKey;
  }
  return instance;
}

const LlmVerifyService = {
  /**
   * Run a verify probe.
   *
   * Resolves with:
   *   - the agent-server's `VerifyLlmResponse` for any HTTP 200, whatever
   *     the discriminated `status` value is. Callers branch on `status`
   *     to decide whether to block, warn, or allow the save.
   *   - `{ status: VERIFY_ENDPOINT_MISSING }` if the connected server is
   *     too old to ship `POST /api/llm/verify` (HTTP 404). The UI treats
   *     this as "verification unavailable, proceed without checks".
   *
   * Rejects (with an `Error`) only on genuinely unexpected transport
   * failures — network errors, 5xx, malformed JSON. The mutation hook
   * surfaces these as a generic toast so the user can still save if they
   * choose to.
   */
  async verify(request: VerifyLlmRequest): Promise<VerifyLlmResult> {
    try {
      const response = await buildClient().post<VerifyLlmResponse>(
        VERIFY_PATH,
        request,
      );
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return { status: VERIFY_ENDPOINT_MISSING };
      }
      throw error;
    }
  },
};

export default LlmVerifyService;
