import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getLastRenderableEventId } from "#/hooks/chat/model-command-event-anchor";
import { recordModelSwitchMessage } from "#/hooks/chat/record-model-switch-message";
import { useSwitchLlmProfile } from "#/hooks/mutation/use-switch-llm-profile";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";

/**
 * Switch the conversation's LLM profile and render the result inline (same
 * UX as `/model <name>`). On success the switch is recorded against the
 * last rendered event so the confirmation lines up with where the user
 * issued the command.
 */
export function useSwitchLlmProfileAndLog() {
  const { mutate, isPending } = useSwitchLlmProfile();
  const { t } = useTranslation();

  const switchAndLog = useCallback(
    (conversationId: string | null, profileName: string) => {
      const anchorEventId = getLastRenderableEventId();

      mutate(
        { conversationId, profileName },
        {
          onSuccess: () => {
            // The inline "Switched to" message is scoped to a conversation;
            // skip it when activating from the home page (no convo yet).
            if (conversationId) {
              recordModelSwitchMessage(
                conversationId,
                profileName,
                anchorEventId,
              );
              // Persist the profile identity on the conversation's server
              // tags so the chat-header switcher recovers it after a reload
              // even when several profiles share a model (#1082). Best-effort
              // — a failed PATCH only loses the display, the runtime switch
              // already succeeded.
              void AgentServerConversationService.updateConversationActiveProfile(
                conversationId,
                profileName,
              ).catch(() => undefined);
            }
          },
          onError: (err: unknown) => {
            const fallback = t(I18nKey.MODEL$SWITCH_FAILED, {
              name: profileName,
            });
            const message =
              err instanceof Error && err.message ? err.message : fallback;
            displayErrorToast(message);
          },
        },
      );
    },
    [mutate, t],
  );

  return { switchAndLog, isPending };
}
