import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getLastRenderableEventId } from "#/hooks/chat/model-command-event-anchor";
import { recordModelSwitchMessage } from "#/hooks/chat/record-model-switch-message";
import { useSwitchLlmProfile } from "#/hooks/mutation/use-switch-llm-profile";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";

/**
 * Switch the conversation's LLM profile and render the result inline (same
 * UX as `/model <name>`). On success the switch is recorded against the
 * last rendered event so the confirmation lines up with where the user
 * issued the command.
 */
export function useSwitchLlmProfileAndLog() {
  const { mutate } = useSwitchLlmProfile();
  const { t } = useTranslation();

  return useCallback(
    (conversationId: string, profileName: string) => {
      const anchorEventId = getLastRenderableEventId();

      mutate(
        { conversationId, profileName },
        {
          onSuccess: () =>
            recordModelSwitchMessage(conversationId, profileName, anchorEventId),
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
}
