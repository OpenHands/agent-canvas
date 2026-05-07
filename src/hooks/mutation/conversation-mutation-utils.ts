import { QueryClient } from "@tanstack/react-query";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import { pauseCloudSandbox } from "#/api/cloud/conversation-service.api";
import V1ConversationService from "#/api/conversation-service/v1-conversation-service.api";
import { V1AppConversation } from "#/api/conversation-service/v1-conversation-service.types";

type ExecutionStatusValue = V1AppConversation["execution_status"];

const fetchV1ConversationData = async (
  conversationId: string,
): Promise<{
  conversationUrl: string | null;
  sessionApiKey: string | null;
  sandboxId: string | null;
}> => {
  const conversations = await V1ConversationService.batchGetAppConversations([
    conversationId,
  ]);

  const appConversation = conversations[0];
  if (!appConversation) {
    throw new Error(`V1 conversation not found: ${conversationId}`);
  }

  return {
    conversationUrl: appConversation.conversation_url,
    sessionApiKey: appConversation.session_api_key,
    sandboxId: appConversation.sandbox_id,
  };
};

export const pauseV1Conversation = async (conversationId: string) => {
  const { conversationUrl, sessionApiKey, sandboxId } =
    await fetchV1ConversationData(conversationId);

  if (getActiveBackend().backend.kind === "cloud") {
    if (!sandboxId) {
      throw new Error(
        `Cannot stop runtime: cloud conversation ${conversationId} has no sandbox_id.`,
      );
    }
    await pauseCloudSandbox(sandboxId);
    return { success: true };
  }

  return V1ConversationService.pauseConversation(
    conversationId,
    conversationUrl,
    sessionApiKey,
  );
};

/**
 * Ask the agent a side question on a V1 conversation
 */
export const askV1Agent = async (
  conversationId: string,
  question: string,
): Promise<{ response: string }> => {
  const { conversationUrl, sessionApiKey } =
    await fetchV1ConversationData(conversationId);
  return V1ConversationService.askAgent(
    conversationId,
    conversationUrl,
    question,
    sessionApiKey,
  );
};

export const resumeV1Conversation = async (conversationId: string) => {
  const { conversationUrl, sessionApiKey } =
    await fetchV1ConversationData(conversationId);
  return V1ConversationService.resumeConversation(
    conversationId,
    conversationUrl,
    sessionApiKey,
  );
};

export const updateConversationExecutionStatusInCache = (
  queryClient: QueryClient,
  conversationId: string,
  execution_status: ExecutionStatusValue,
): void => {
  queryClient.setQueryData<V1AppConversation | null>(
    ["user", "conversation", conversationId],
    (oldData) => {
      if (!oldData) return oldData;
      return { ...oldData, execution_status };
    },
  );

  queryClient.setQueriesData<{
    pages: Array<{
      items: Array<{ id: string; execution_status: ExecutionStatusValue }>;
    }>;
  }>({ queryKey: ["user", "conversations"] }, (oldData) => {
    if (!oldData) return oldData;

    return {
      ...oldData,
      pages: oldData.pages.map((page) => ({
        ...page,
        items: page.items.map((conv) =>
          conv.id === conversationId ? { ...conv, execution_status } : conv,
        ),
      })),
    };
  });
};

export const invalidateConversationQueries = (
  queryClient: QueryClient,
  conversationId: string,
): void => {
  queryClient.invalidateQueries({
    queryKey: ["user", "conversation", conversationId],
  });
  queryClient.invalidateQueries({ queryKey: ["user", "conversations"] });
  queryClient.invalidateQueries({
    queryKey: ["v1-batch-get-app-conversations"],
  });
  queryClient.invalidateQueries({ queryKey: ["unified", "vscode_url"] });
};
