import React from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertCircle, WifiOff, Loader2 } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import type { VerifyLlmStatus } from "#/api/llm-verify-service/llm-verify-service.types";

/**
 * Local UI state for `<LlmConnectionStatus />`.
 *
 * `idle` and `endpoint_missing` render nothing — the latter happens when the
 * connected agent-server is too old to ship `/api/llm/verify`, in which case
 * we degrade silently rather than scaring the user with an error they can't
 * action.
 *
 * `verifying` is a transient UI-only state that the server never returns;
 * the rest map 1:1 onto `VerifyLlmStatus`.
 */
export type LlmVerifyUiStatus =
  | "idle"
  | "verifying"
  | "endpoint_missing"
  | VerifyLlmStatus;

export interface LlmVerifyState {
  status: LlmVerifyUiStatus;
  /** Provider-supplied error detail (passed through from the agent-server). */
  message?: string | null;
  /** LiteLLM provider name, if reported (used in the success banner). */
  provider?: string | null;
}

interface LlmConnectionStatusProps {
  state: LlmVerifyState;
  /**
   * Called when the user clicks "Save anyway" on an indeterminate failure
   * (timeout / unreachable / unknown_error). The component renders the
   * affordance only when this callback is provided.
   */
  onSaveAnyway?: () => void;
}

const STATUSES_THAT_RENDER_NOTHING: LlmVerifyUiStatus[] = [
  "idle",
  "endpoint_missing",
];

const STATUSES_ALLOWING_SAVE_ANYWAY: LlmVerifyUiStatus[] = [
  "timeout",
  "unreachable",
  "unknown_error",
];

/** Inline banner reflecting the current LLM connection-test result. */
export function LlmConnectionStatus({
  state,
  onSaveAnyway,
}: LlmConnectionStatusProps) {
  const { t } = useTranslation("openhands");

  if (STATUSES_THAT_RENDER_NOTHING.includes(state.status)) return null;

  if (state.status === "verifying") {
    return (
      <div
        role="status"
        data-testid="llm-verify-testing"
        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
      >
        <Loader2
          className="size-4 shrink-0 animate-spin text-[var(--oh-text-tertiary)]"
          aria-hidden
        />
        <span className="text-sm text-[var(--oh-text-tertiary)]">
          {t(I18nKey.LLM_VERIFY$TESTING)}
        </span>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div
        role="status"
        data-testid="llm-verify-success"
        className="flex items-center gap-3 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3"
      >
        <CheckCircle2 className="size-4 shrink-0 text-green-400" aria-hidden />
        <span className="text-sm text-green-200">
          {t(I18nKey.LLM_VERIFY$SUCCESS)}
        </span>
      </div>
    );
  }

  // ── Hard failures (block save) ─────────────────────────────────────────
  if (state.status === "auth_error" || state.status === "bad_request") {
    const fallbackKey =
      state.status === "auth_error"
        ? I18nKey.LLM_VERIFY$AUTH_ERROR
        : I18nKey.LLM_VERIFY$BAD_REQUEST;
    return (
      <div
        role="alert"
        data-testid={`llm-verify-${state.status.replace("_", "-")}`}
        className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3"
      >
        <AlertCircle className="size-4 shrink-0 text-red-400" aria-hidden />
        <span className="text-sm text-red-200">
          {state.message || t(fallbackKey)}
        </span>
      </div>
    );
  }

  // ── Soft failures (warn, may allow save) ───────────────────────────────
  if (state.status === "rate_limited") {
    return (
      <div
        role="status"
        data-testid="llm-verify-rate-limited"
        className="flex items-center gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3"
      >
        <AlertCircle className="size-4 shrink-0 text-yellow-400" aria-hidden />
        <span className="text-sm text-yellow-200">
          {t(I18nKey.LLM_VERIFY$RATE_LIMITED)}
        </span>
      </div>
    );
  }

  // ── Indeterminate (timeout / unreachable / unknown) ─────────────────────
  if (STATUSES_ALLOWING_SAVE_ANYWAY.includes(state.status)) {
    const fallbackKey =
      state.status === "timeout"
        ? I18nKey.LLM_VERIFY$TIMEOUT
        : state.status === "unreachable"
          ? I18nKey.LLM_VERIFY$UNREACHABLE
          : I18nKey.LLM_VERIFY$UNKNOWN_ERROR;
    return (
      <div
        role="alert"
        data-testid={`llm-verify-${state.status.replace("_", "-")}`}
        className="flex flex-col gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3"
      >
        <div className="flex items-center gap-3">
          <WifiOff className="size-4 shrink-0 text-yellow-400" aria-hidden />
          <span className="text-sm text-yellow-200">
            {state.message || t(fallbackKey)}
          </span>
        </div>
        {onSaveAnyway && (
          <button
            type="button"
            data-testid="llm-verify-save-anyway"
            onClick={onSaveAnyway}
            className="self-start text-xs text-yellow-400 underline hover:no-underline"
          >
            {t(I18nKey.LLM_VERIFY$SAVE_ANYWAY)}
          </button>
        )}
      </div>
    );
  }

  return null;
}
