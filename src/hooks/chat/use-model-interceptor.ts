import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import ProfilesService from "#/api/profiles-service/profiles-service.api";
import { useSwitchLlmProfileAndLog } from "#/hooks/mutation/use-switch-llm-profile-and-log";
import { getLastRenderableEventId } from "#/hooks/chat/model-command-event-anchor";
import { LLM_PROFILES_QUERY_KEYS } from "#/hooks/query/query-keys";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useModelStore } from "#/stores/model-store";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { MODEL_COMMAND } from "#/utils/constants";

const MODEL_PREFIX = `${MODEL_COMMAND} `;

/**
 * Intercepts "/model" submissions:
 *   - "/model"        → render an inline list of saved profiles in the chat
 *   - "/model <name>" → switch the running conversation's LLM profile
 * Anything else (or when on a cloud backend, which doesn't support profiles)
 * falls through to `onSubmit`.
 */
export const useModelInterceptor = (
  conversationId: string | null | undefined,
  onSubmit: (message: string) => void,
) => {
  const showProfiles = useModelStore((s) => s.show);
  const queryClient = useQueryClient();
  const { switchAndLog } = useSwitchLlmProfileAndLog();
  const { backend, orgId } = useActiveBackend();
  const isLocal = backend.kind === "local";
  const { t } = useTranslation();

  return useCallback(
    (message: string) => {
      const trimmed = message.trim();
      const isModel =
        trimmed === MODEL_COMMAND || trimmed.startsWith(MODEL_PREFIX);
      if (!isModel || !isLocal) {
        onSubmit(message);
        return;
      }

      const arg = trimmed.slice(MODEL_COMMAND.length).trim();

      if (arg) {
        // `activateProfile` is global; works whether or not we have an active
        // conversation. Pass conversationId through so the inline "Switched
        // to" message gets anchored when one is open.
        switchAndLog(conversationId ?? null, arg);
        return;
      }

      // Bare `/model` — list profiles inline. Needs a conversation to anchor
      // the entry to; swallow silently on the home page.
      if (!conversationId) return;

      const anchorEventId = getLastRenderableEventId();

      // Imperative fetch through the query cache so the result lands on the
      // same key `useLlmProfiles` reads. `staleTime: 0` forces a fresh fetch
      // each time the user types /model.
      // Multiple rapid /model submissions intentionally append multiple chat
      // entries, matching normal command history behavior rather than replacing
      // earlier results.

      queryClient
        .fetchQuery({
          queryKey: [...LLM_PROFILES_QUERY_KEYS.all, backend.id, orgId],
          queryFn: ProfilesService.listProfiles,
          staleTime: 0,
        })
        .then(({ profiles }) =>
          showProfiles(conversationId, anchorEventId, profiles),
        )
        .catch((err: unknown) => {
          const fallback = t(I18nKey.MODEL$LIST_FAILED);
          const messageText =
            err instanceof Error && err.message ? err.message : fallback;
          displayErrorToast(messageText);
        });
    },
    [
      conversationId,
      isLocal,
      onSubmit,
      showProfiles,
      queryClient,
      switchAndLog,
      backend.id,
      orgId,
      t,
    ],
  );
};
