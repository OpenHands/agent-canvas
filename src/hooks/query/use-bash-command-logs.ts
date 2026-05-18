import { useQuery } from "@tanstack/react-query";
import BashService from "#/api/bash-service/bash-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useUserConversation } from "./use-user-conversation";

export const BASH_COMMAND_LOGS_QUERY_KEY = ["bash-command-logs"] as const;

interface UseBashCommandLogsOptions {
  /**
   * The agent-server conversation that hosts the bash command. Used to
   * resolve `conversation_url` and `session_api_key` for cloud backends.
   * Optional in local mode: when the conversation lookup hasn't
   * resolved yet (or returns no runtime URL), local-mode queries fall
   * back to the active backend's host.
   */
  conversationId: string | null | undefined;
  bashCommandId: string | null | undefined;
  enabled?: boolean;
}

/**
 * Search `BashOutput` events for an automation run's bash command.
 *
 * - **Local backend**: the query fires as soon as the modal opens and
 *   we have a `bash_command_id`. The conversation lookup runs in
 *   parallel; if it resolves with `session_api_key`/`conversation_url`
 *   those are passed through, but a missing/stale conversation does not
 *   block the bash query (the local agent-server hosts events under a
 *   single root).
 * - **Cloud backend**: the query is gated on `conversation_url` being
 *   available because cloud runtime endpoints live on per-conversation
 *   sub-domains. We surface `isResolvingConversation` /
 *   `conversationMissing` / `hasNoRuntime` so the modal can render
 *   meaningful empty states instead of an endless spinner.
 */
export function useBashCommandLogs(options: UseBashCommandLogsOptions) {
  const { conversationId, bashCommandId, enabled = true } = options;
  const active = useActiveBackend();
  const conversationQuery = useUserConversation(conversationId ?? null);
  const conversation = conversationQuery.data;
  const conversationUrl = conversation?.conversation_url ?? null;
  const sessionApiKey = conversation?.session_api_key ?? null;

  const isCloud = active.backend.kind === "cloud";
  // Cloud requires the runtime URL; local does not.
  const hasRequiredAuth = isCloud ? !!conversationUrl : true;

  const query = useQuery({
    queryKey: [
      ...BASH_COMMAND_LOGS_QUERY_KEY,
      bashCommandId,
      conversationUrl,
      sessionApiKey,
      active.backend.id,
      active.orgId,
    ],
    queryFn: () =>
      BashService.listOutputs(
        conversationUrl,
        sessionApiKey,
        bashCommandId as string,
      ),
    enabled: enabled && !!bashCommandId && hasRequiredAuth,
    // Completed-run logs don't change — cache long enough that reopening
    // the modal is instant but not forever.
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    data: query.data,
    error: query.error,
    isFetching: query.isFetching,
    isPending: query.isPending,
    /** True while we're still resolving the conversation runtime URL. */
    isResolvingConversation: isCloud && conversationQuery.isPending,
    /** Cloud-only: conversation exists but has no runtime URL (sandbox gone). */
    hasNoRuntime:
      isCloud &&
      conversationQuery.isFetched &&
      !!conversation &&
      !conversation.conversation_url,
    /** Cloud-only: conversation lookup failed (deleted or no access). */
    conversationMissing:
      isCloud && conversationQuery.isFetched && !conversation,
  };
}
