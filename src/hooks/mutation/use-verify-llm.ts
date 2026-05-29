import { useMutation } from "@tanstack/react-query";
import LlmVerifyService from "#/api/llm-verify-service/llm-verify-service.api";
import type {
  VerifyLlmRequest,
  VerifyLlmResult,
} from "#/api/llm-verify-service/llm-verify-service.types";

/**
 * Probe an LLM configuration via the agent-server's `POST /api/llm/verify`.
 *
 * The mutation is **not** persistent — it doesn't write to any query cache
 * or touch settings. Callers decide what to do with the result (block save,
 * warn the user, allow save). `meta.disableToast` is set because verify
 * outcomes are surfaced inline via `<LlmConnectionStatus />`, not via the
 * global toast container.
 */
export function useVerifyLlm() {
  return useMutation<VerifyLlmResult, Error, VerifyLlmRequest>({
    mutationFn: (request) => LlmVerifyService.verify(request),
    meta: { disableToast: true },
  });
}
