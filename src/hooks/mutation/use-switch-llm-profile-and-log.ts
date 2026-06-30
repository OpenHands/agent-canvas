import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getLastRenderableEventId } from "#/hooks/chat/model-command-event-anchor";
import { recordModelSwitchMessage } from "#/hooks/chat/record-model-switch-message";
import { useSwitchLlmProfile } from "#/hooks/mutation/use-switch-llm-profile";
import {
  getStoredConversationMetadata,
  setStoredConversationMetadata,
} from "#/api/conversation-metadata-store";
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
              // Keep the per-conversation profile identity fresh so the
              // chat-header switcher shows the right name after a reload
              // (the agent-server only round-trips the model string). #1082
              const prev = getStoredConversationMetadata(conversationId);
              setStoredConversationMetadata(conversationId, {
                selected_repository: prev?.selected_repository ?? null,
                selected_branch: prev?.selected_branch ?? null,
                git_provider: prev?.git_provider ?? null,
                selected_workspace: prev?.selected_workspace ?? null,
                active_profile: profileName,
                // Full-object replace: carry the plugins snapshot forward so
                // the in-conversation plugins view survives a profile switch.
                plugins: prev?.plugins ?? null,
              });
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
