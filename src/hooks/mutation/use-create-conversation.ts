import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { PluginSpec } from "#/api/conversation-service/agent-server-conversation-service.types";
import { SuggestedTask } from "#/utils/types";
import { Provider } from "#/types/settings";
import { useTracking } from "#/hooks/use-tracking";

interface CreateConversationVariables {
  query?: string;
  repository?: {
    name: string;
    gitProvider: Provider;
    branch?: string;
  };
  suggestedTask?: SuggestedTask;
  conversationInstructions?: string;
  parentConversationId?: string;
  agentType?: "default" | "plan";
  plugins?: PluginSpec[];
  workingDir?: string;
}

interface CreateConversationResponse {
  conversation_id: string;
  session_api_key: string | null;
  url: string | null;
  task_id?: string;
}

export const useCreateConversation = () => {
  const queryClient = useQueryClient();
  const { trackConversationCreated } = useTracking();

  return useMutation({
    mutationKey: ["create-conversation"],
    mutationFn: async (
      variables: CreateConversationVariables,
    ): Promise<CreateConversationResponse> => {
      const {
        query,
        conversationInstructions,
        plugins,
        repository,
        workingDir,
        parentConversationId,
        agentType,
      } = variables;

      const conversation =
        await AgentServerConversationService.createConversation(
          query,
          conversationInstructions,
          plugins,
          repository
            ? {
                selected_repository: repository.name,
                selected_branch: repository.branch ?? null,
                git_provider: repository.gitProvider,
              }
            : null,
          workingDir,
          parentConversationId,
          agentType,
        );

      // OpenHands SaaS pattern: when the start task isn't immediately
      // READY (cloud sandbox is still provisioning),
      // app_conversation_id is null. We return a `task-{id}` URL so the
      // conversation route's useTaskPolling can drive it to READY and
      // then redirect to the real `/conversations/{app_conversation_id}`.
      const conversationId = conversation.app_conversation_id
        ? conversation.app_conversation_id
        : `task-${conversation.id}`;

      return {
        conversation_id: conversationId,
        session_api_key: null,
        url: conversation.agent_server_url,
        task_id: conversation.id,
      };
    },
    onSuccess: async (_, { repository }) => {
      trackConversationCreated({
        hasRepository: !!repository,
      });

      // Invalidate (rather than remove) so the existing paginated list stays
      // rendered while a background refetch picks up the new conversation.
      // `removeQueries` would wipe the cache and force the panel back to its
      // initial loading state, dropping loaded pages and scroll position.
      queryClient.invalidateQueries({
        queryKey: ["user", "conversations"],
      });
      // The cloud SaaS path returns a start task (no app_conversation_id
      // yet); the sidebar surfaces those via `useStartTasks` which doesn't
      // poll, so invalidate it explicitly so the in-flight task shows up
      // in the conversation list immediately.
      queryClient.invalidateQueries({
        queryKey: ["start-tasks"],
      });
    },
  });
};
