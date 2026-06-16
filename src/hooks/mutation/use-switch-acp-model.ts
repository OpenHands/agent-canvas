import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import SettingsService from "#/api/settings-service/settings-service.api";
import { SETTINGS_QUERY_KEYS } from "#/hooks/query/query-keys";
import { getErrorStatus } from "#/hooks/query/use-settings";
import i18n from "#/i18n";
import { I18nKey } from "#/i18n/declaration";
import { invalidateConversationQueries } from "./conversation-mutation-utils";

interface SwitchAcpModelVars {
  /**
   * When set, the ACP conversation's running model is swapped live via the
   * wrapper's ``session/set_model`` (POST /switch_acp_model) and the user's
   * saved default is untouched. When null (home page / no session), the model
   * is persisted as the agent-settings default so the next conversation
   * created here inherits it.
   */
  conversationId: string | null;
  model: string;
}

/**
 * ACP analog of {@link useSwitchLlmProfile}.
 * - In-conversation with a live ACP session: live in-place switch via
 *   ``session/set_model``.
 * - Home page (``conversationId === null``): persist as the agent-settings
 *   default so the next conversation inherits it.
 * - In-conversation before the first message (no session → 409): surface a
 *   clear error — the model can't be applied to this conversation yet
 *   (temporary until OpenHands/software-agent-sdk#3763).
 *
 * Invalidates the same conversation/settings query keys the profile hook does
 * so the chat-input model chip + conversation chip refresh with the new model.
 */
export const useSwitchAcpModel = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, model }: SwitchAcpModelVars) => {
      if (conversationId) {
        try {
          await AgentServerConversationService.switchAcpModel(
            conversationId,
            model,
          );
        } catch (error: unknown) {
          // Before the first message there's no live ACP session, so the
          // agent-server returns 409. The switch can't be applied to *this*
          // conversation: its agent's ``acp_model`` is baked at creation and
          // ``session/set_model`` needs a live session. Persisting to
          // agent-settings would only change the *next* conversation's default,
          // not this one — a silent no-op here. Surface an honest error
          // instead. Temporary until the SDK persists a pre-session switch
          // (OpenHands/software-agent-sdk#3763), after which the 409 goes away.
          // getErrorStatus reads both the SDK client's ``status`` and axios's
          // ``response.status`` so the cloud-proxy path is covered too.
          if (getErrorStatus(error) === 409) {
            throw new Error(
              i18n.t(I18nKey.CHAT_INTERFACE$ACP_MODEL_SWITCH_REQUIRES_SESSION),
            );
          }
          throw error;
        }
        return;
      }
      // Home page / no session: persist as the agent-settings default. The
      // backend deep-merges ``agent_settings_diff`` into the existing
      // ``agent_settings`` dict, so a scalar ``acp_model`` diff updates only
      // the model and preserves the selected provider + command.
      await SettingsService.saveSettings({
        agent_settings_diff: { acp_model: model },
      });
    },
    onSuccess: (_data, { conversationId }) => {
      if (conversationId) {
        invalidateConversationQueries(queryClient, conversationId);
      } else {
        // Mirror useSwitchLlmProfile's home-page path: clear the stale settings
        // cache so the next conversation-start reads the newly saved default,
        // and refetch the settings query so the home-page chip updates.
        SettingsService.invalidateCache();
        queryClient.invalidateQueries({
          queryKey: SETTINGS_QUERY_KEYS.personal(),
        });
      }
    },
    // No meta.disableToast: unlike useSwitchLlmProfile (wrapped by
    // useSwitchLlmProfileAndLog, which re-surfaces errors), this hook is called
    // directly, so we let the global mutation error toast report a failed
    // switch / settings write rather than swallowing it.
  });
};
