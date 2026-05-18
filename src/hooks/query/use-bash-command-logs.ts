import { useQuery } from "@tanstack/react-query";
import BashService from "#/api/bash-service/bash-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useUserConversation } from "./use-user-conversation";

export const BASH_COMMAND_LOGS_QUERY_KEY = ["bash-command-logs"] as const;

interface UseBashCommandLogsOptions {
  /**
   * The agent-server conversation that hosts the bash command. The hook
   * fetches it to resolve `conversation_url` and `session_api_key`, which
   * are required to read bash events from the runtime.
   */
  conversationId: string | null | undefined;
  bashCommandId: string | null | undefined;
  enabled?: boolean;
}

/**
 * Fetch the bash command + its outputs for an automation run.
 *
 * Bash events live on the same agent-server that hosts the conversation,
 * so we first hydrate the conversation (to resolve its runtime URL and
 * session API key) and then page through `BashOutput` events for the
 * command. Disabled until both ids and a runtime URL are available.
 */
export function useBashCommandLogs(options: UseBashCommandLogsOptions) {
  const { conversationId, bashCommandId, enabled = true } = options;
  const active = useActiveBackend();
  const conversationQuery = useUserConversation(conversationId ?? null);
  const conversation = conversationQuery.data;
  const conversationUrl = conversation?.conversation_url ?? null;
  const sessionApiKey = conversation?.session_api_key ?? null;

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
      BashService.getCommandLogs(
        conversationUrl as string,
        sessionApiKey,
        bashCommandId as string,
      ),
    enabled: enabled && !!bashCommandId && !!conversationUrl,
    // Logs of a completed run don't change; cache long enough that
    // reopening the modal is instant but not forever.
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
    isResolvingConversation: conversationQuery.isPending,
    /** Conversation exists but has no runtime URL yet (sandbox paused/gone). */
    hasNoRuntime:
      conversationQuery.isFetched &&
      !!conversation &&
      !conversation.conversation_url,
    /** Conversation lookup failed (e.g. deleted or no access). */
    conversationMissing: conversationQuery.isFetched && !conversation,
  };
}
