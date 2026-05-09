import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useConversationId } from "#/hooks/use-conversation-id";
import { I18nKey } from "#/i18n/declaration";
import ConversationService from "#/api/conversation-service/conversation-service.api";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { transformVSCodeUrl } from "#/utils/vscode-url-helper";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";

interface VSCodeUrlResult {
  url: string | null;
}

export const useUnifiedVSCodeUrl = () => {
  const { t } = useTranslation("openhands");
  const { conversationId } = useConversationId();
  const runtimeIsReady = useRuntimeIsReady({ allowAgentError: true });
  const { data: conversation } = useActiveConversation();

  const conversationUrl = conversation?.conversation_url ?? null;
  const sessionApiKey = conversation?.session_api_key ?? null;

  const mainQuery = useQuery<VSCodeUrlResult>({
    // Include conversation host + key in the cache key so different
    // conversations don't share VSCode URL data, and so a cloud-→-local
    // (or vice versa) swap re-fetches against the right host.
    queryKey: [
      "unified",
      "vscode_url",
      conversationId,
      conversationUrl,
      sessionApiKey,
    ],
    queryFn: async () => {
      if (!conversationId) throw new Error("No conversation ID");

      // Forward the conversation's owning host + session key so cloud
      // conversations hit their cloud sandbox rather than falling back
      // to the bundled local agent-server.
      const response = await AgentServerConversationService.getVSCodeUrl(
        conversationId,
        conversationUrl,
        sessionApiKey,
      ).catch(() => ConversationService.getVSCodeUrl(conversationId));

      return { url: transformVSCodeUrl(response.vscode_url) };
    },
    enabled: runtimeIsReady && !!conversationId,
    refetchOnMount: true,
    retry: 3,
  });

  // Derive the i18n'd "URL unavailable" message outside `queryFn` so the
  // queryKey doesn't have to include `t`.
  const error =
    mainQuery.data && !mainQuery.data.url
      ? t(I18nKey.VSCODE$URL_NOT_AVAILABLE)
      : null;

  return {
    data: mainQuery.data ? { ...mainQuery.data, error } : undefined,
    error: mainQuery.error,
    isLoading: mainQuery.isLoading,
    isError: mainQuery.isError,
    isSuccess: mainQuery.isSuccess,
    status: mainQuery.status,
    refetch: mainQuery.refetch,
  };
};
