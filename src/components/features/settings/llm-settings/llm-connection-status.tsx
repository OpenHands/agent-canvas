import React from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertCircle, WifiOff, Loader2 } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import type { VerifyStatus } from "#/api/llm-verify-service";

export interface LlmVerifyState {
  status: VerifyStatus | "verifying" | "idle";
  /** Provider-supplied error detail. */
  message?: string;
}

interface LlmConnectionStatusProps {
  state: LlmVerifyState;
  /** Called when the user clicks "Save anyway" on a network_error result. */
  onSaveAnyway?: () => void;
}

/**
 * Renders an inline banner reflecting the current LLM connection-test status.
 * Returns null when status is 'idle' or 'unsupported' (nothing to show).
 */
export function LlmConnectionStatus({
  state,
  onSaveAnyway,
}: LlmConnectionStatusProps) {
  const { t } = useTranslation("openhands");

  if (state.status === "idle" || state.status === "unsupported") return null;

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

  if (state.status === "auth_error") {
    return (
      <div
        role="alert"
        data-testid="llm-verify-auth-error"
        className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3"
      >
        <AlertCircle className="size-4 shrink-0 text-red-400" aria-hidden />
        <span className="text-sm text-red-200">
          {state.message ?? t(I18nKey.LLM_VERIFY$AUTH_ERROR)}
        </span>
      </div>
    );
  }

  if (state.status === "network_error") {
    return (
      <div
        role="alert"
        data-testid="llm-verify-network-error"
        className="flex flex-col gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3"
      >
        <div className="flex items-center gap-3">
          <WifiOff className="size-4 shrink-0 text-yellow-400" aria-hidden />
          <span className="text-sm text-yellow-200">
            {t(I18nKey.LLM_VERIFY$NETWORK_ERROR)}
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
