import { useTranslation } from "react-i18next";
import { BadgeCheck, CircleCheck, CircleX } from "lucide-react";

import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import type { CheckStatus } from "#/utils/check-result";

/**
 * Advisory verification verdict for a conversation (Bet D) — the firehose-scale
 * companion to the Checks tab. A compact ✓ / ✗ a reviewer can scan in the
 * control room without opening the conversation.
 *
 * Presentational only: it renders the verdict it's handed and nothing more.
 * The per-conversation read of `.checks/result.json` lives in
 * `useConversationCheckResult` — keeping this a pure leaf means the row, the
 * header, and any future surface share one component, and it's trivially
 * testable.
 *
 * `status === null` renders nothing — most conversations have no verdict (the
 * run isn't finished, or it predates verification). A missing verdict is the
 * common, silent case, never an error state.
 *
 * a11y mirrors the Checks tab's CheckRow: the colored icon is `aria-hidden`
 * (color alone never conveys state) and an `sr-only` label carries the verdict.
 * The label is subject-bearing ("Verification passed", not bare "Passed")
 * because on a dense row there's no surrounding heading to imply what passed.
 */
export function VerificationVerdictBadge({
  status,
  onOpenChecks,
  approved = false,
}: {
  status: CheckStatus | null;
  onOpenChecks?: () => void;
  approved?: boolean;
}) {
  const { t } = useTranslation("openhands");

  if (status === null) return null;

  const passed = status === "passed";
  const isApproved = passed && approved;
  const Icon = isApproved ? BadgeCheck : passed ? CircleCheck : CircleX;
  const label = t(
    isApproved
      ? I18nKey.CONVERSATION_PANEL$VERIFICATION_APPROVED
      : passed
        ? I18nKey.CONVERSATION_PANEL$VERIFICATION_PASSED
        : I18nKey.CONVERSATION_PANEL$VERIFICATION_FAILED,
  );

  const icon = (
    <>
      <Icon
        className={cn(
          "size-3",
          isApproved || passed
            ? "text-[var(--oh-status-success)]"
            : "text-[var(--oh-status-error)]",
        )}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </>
  );

  if (onOpenChecks) {
    return (
      <button
        type="button"
        data-testid="verification-verdict-badge"
        data-status={status}
        data-approved={isApproved ? "true" : "false"}
        aria-label={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenChecks();
        }}
        className="inline-flex shrink-0 cursor-pointer items-center rounded-sm"
      >
        {icon}
      </button>
    );
  }

  return (
    <span
      data-testid="verification-verdict-badge"
      data-status={status}
      data-approved={isApproved ? "true" : "false"}
      className="inline-flex shrink-0 items-center"
    >
      {icon}
    </span>
  );
}
