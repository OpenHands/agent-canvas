import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { useWakeConversation } from "#/hooks/mutation/use-wake-conversation";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

interface AcpResumeArchivedButtonProps {
  conversation: AppConversation;
}

/**
 * Resume affordance shown in place of the read-only "archived" notice for an
 * ACP conversation whose cloud sandbox was recycled. Waking re-provisions a
 * fresh sandbox under the same conversation id; the backend resumes the
 * conversation from the durable event store with a bootstrap prompt
 * (OpenHands#14640). The active-conversation poll then reconnects once the
 * fresh sandbox is RUNNING.
 */
export function AcpResumeArchivedButton({
  conversation,
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
            { conversationId: conversation.id, conversation },
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
