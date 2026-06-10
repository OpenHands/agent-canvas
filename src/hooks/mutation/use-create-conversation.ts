import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { PluginSpec } from "#/api/conversation-service/agent-server-conversation-service.types";
import { SuggestedTask } from "#/utils/types";
import { Provider } from "#/types/settings";
import { useTracking } from "#/hooks/use-tracking";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";

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
  // Cache-warm on the home page (the profile picker reads the same query).
  // Stamped onto the conversation at creation so the switcher can show the
  // exact profile even when several profiles share a model (#1082).
  const { data: llmProfiles } = useLlmProfiles();

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

      // Stamp the active LLM profile onto the new conversation so the chat
      // switcher shows the exact profile even when several profiles share a
      // model (#1082). Passed through `metadata.active_profile` so the
      // conversation service writes it as a server tag in the same request
      // as the repo/workspace selection — one round-trip, no localStorage.
      // Keep the metadata arg `null` when there's nothing meaningful to
      // stamp (no repo, no profile) so the wire-shape matches a pre-tag
      // create — tests assert call args against `null` in that case.
      const activeProfile = llmProfiles?.active_profile ?? null;
      const metadata =
        repository || activeProfile
          ? {
              selected_repository: repository?.name ?? null,
              selected_branch: repository?.branch ?? null,
              git_provider: repository?.gitProvider ?? null,
              active_profile: activeProfile,
            }
          : null;

      const conversation =
        await AgentServerConversationService.createConversation(
          query,
          conversationInstructions,
          plugins,
          metadata,
          workingDir,
          parentConversationId,
          agentType,
        );

      // OpenHands cloud pattern: when the start task isn't immediately
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
      // The cloud path returns a start task (no app_conversation_id
      // yet); the sidebar surfaces those via `useStartTasks` which doesn't
      // poll, so invalidate it explicitly so the in-flight task shows up
      // in the conversation list immediately.
      queryClient.invalidateQueries({
        queryKey: ["start-tasks"],
      });
    },
  });
};
