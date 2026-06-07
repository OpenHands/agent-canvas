import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { useWakeConversation } from "#/hooks/mutation/use-wake-conversation";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

interface AcpResumeArchivedButtonProps {
  conversationId: string;
}

/**
 * Resume affordance shown in place of the read-only "archived" notice for an
 * ACP conversation whose cloud sandbox was recycled. Waking re-provisions a
 * fresh sandbox under the same conversation id; the backend restores the CLI
 * session and continues natively via session/load (#1126). The active
 * conversation query then polls the new sandbox to RUNNING and reconnects.
 */
export function AcpResumeArchivedButton({
  conversationId,
}: AcpResumeArchivedButtonProps) {
  const { t } = useTranslation();
  const { mutate: wake, isPending } = useWakeConversation();

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-[var(--oh-muted)]">
        {t(I18nKey.CHAT_INTERFACE$ACP_RESUME_SANDBOX_DESCRIPTION)}
      </p>
      <BrandButton
        type="button"
        variant="primary"
        isDisabled={isPending}
        onClick={() =>
          wake(
            { conversationId },
            {
              onError: (error) =>
                displayErrorToast(
                  error instanceof Error ? error.message : String(error),
                ),
            },
          )
        }
        testId="acp-resume-conversation-button"
      >
        {isPending
          ? t(I18nKey.CHAT_INTERFACE$ACP_RESUME_STARTING)
          : t(I18nKey.CHAT_INTERFACE$ACP_RESUME_BUTTON)}
      </BrandButton>
    </div>
  );
}
