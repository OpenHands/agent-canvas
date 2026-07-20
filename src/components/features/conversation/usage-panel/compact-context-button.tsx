import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useAgentState } from "#/hooks/use-agent-state";
import { useCondenseConversation } from "#/hooks/mutation/use-condense-conversation";
import { AgentState } from "#/types/agent-state";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import { CONTEXT_FILL_WARNING_PERCENT } from "./context-meter";

interface CompactContextButtonProps {
  /** Current context fill percentage; past the warning threshold the button becomes a prominent CTA. */
  fillPercent: number;
}

/**
 * "Compact context" action: POSTs `/api/conversations/{id}/condense` with a
 * spinner while in flight and a toast on success/failure. Disabled while the
 * agent is actively running (the server would race the active step) and
 * promoted to a primary call-to-action once the context fill passes
 * {@link CONTEXT_FILL_WARNING_PERCENT}.
 */
export function CompactContextButton({
  fillPercent,
}: CompactContextButtonProps) {
  const { t } = useTranslation("openhands");
  const { data: conversation } = useActiveConversation();
  const { curAgentState } = useAgentState();
  const { mutate: condense, isPending } = useCondenseConversation();

  const isAgentBusy =
    curAgentState === AgentState.RUNNING ||
    curAgentState === AgentState.LOADING;
  const isHighFill = fillPercent > CONTEXT_FILL_WARNING_PERCENT;

  const handleCompact = () => {
    if (!conversation?.id || isPending) return;
    condense(
      {
        conversationId: conversation.id,
        conversationUrl: conversation.conversation_url,
        sessionApiKey: conversation.session_api_key,
      },
      {
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.CONVERSATION$COMPACT_CONTEXT_STARTED));
        },
        onError: (error) => {
          // Covers 409-style rejections (agent mid-step) as well as plain
          // network failures — surface the server message when there is one.
          displayErrorToast(
            retrieveAxiosErrorMessage(error) ||
              t(I18nKey.CONVERSATION$COMPACT_CONTEXT_FAILED),
          );
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {isHighFill && (
        <span className="text-xs text-amber-500">
          {t(I18nKey.CONVERSATION$CONTEXT_FILLING_UP)}
        </span>
      )}
      <BrandButton
        testId="compact-context-button"
        type="button"
        variant={isHighFill ? "primary" : "secondary"}
        isDisabled={!conversation?.id || isAgentBusy || isPending}
        aria-busy={isPending}
        onClick={handleCompact}
        startContent={
          isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : undefined
        }
        className="w-full"
      >
        {t(I18nKey.CONVERSATION$COMPACT_CONTEXT)}
      </BrandButton>
    </div>
  );
}
