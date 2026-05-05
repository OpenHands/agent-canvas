import { useMutation, useQueryClient } from "@tanstack/react-query";
import V1ConversationService from "#/api/conversation-service/v1-conversation-service.api";
import { PluginSpec } from "#/api/conversation-service/v1-conversation-service.types";
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

// Response type for V1 conversations
interface CreateConversationResponse {
  conversation_id: string;
  session_api_key: string | null;
  url: string | null;
  v1_task_id?: string;
  is_v1?: boolean;
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
      } = variables;

      const conversation = await V1ConversationService.createConversation(
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
      );

      return {
        conversation_id: conversation.app_conversation_id || conversation.id,
        session_api_key: null,
        url: conversation.agent_server_url,
        is_v1: true,
      };
    },
    onSuccess: async (_, { repository }) => {
      trackConversationCreated({
        hasRepository: !!repository,
      });

      queryClient.removeQueries({
        queryKey: ["user", "conversations"],
      });
    },
  });
};
