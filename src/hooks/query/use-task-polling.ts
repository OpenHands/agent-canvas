import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { useNavigation } from "#/context/navigation-context";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import {
  consumePendingTaskDraft,
  setConversationState,
} from "#/utils/conversation-local-storage";

/**
 * Hook that polls V1 conversation start tasks and navigates when ready.
 *
 * This hook:
 * - Detects if the conversationId URL param is a task ID (format: "task-{uuid}")
 * - Polls the V1 start task API every 3 seconds until status is READY or ERROR
 * - Automatically navigates to the conversation URL when the task becomes READY
 * - Exposes task status and details for UI components to show loading states and errors
 *
 * URL patterns:
 * - /conversations/task-{uuid} → Polls start task, then navigates to /conversations/{conversation-id}
 * - /conversations/{uuid or hex} → No polling (handled by useActiveConversation)
 *
 * Note: This hook does NOT fetch conversation data. It only handles task polling and navigation.
 */
export const useTaskPolling = () => {
  // Optional: the chat input shell renders on the home page too; polling
  // simply no-ops when there's no conversation id yet.
  const { conversationId } = useOptionalConversationId();
  const { navigate } = useNavigation();

  // Check if this is a task ID (format: "task-{uuid}")
  const isTask = !!conversationId && conversationId.startsWith("task-");
  const taskId = isTask ? conversationId!.replace("task-", "") : null;

  // Poll the task if this is a task ID
  const taskQuery = useQuery({
    queryKey: ["start-task", taskId],
    queryFn: async () => {
      if (!taskId) return null;
      return AgentServerConversationService.getStartTask(taskId);
    },
    enabled: !!taskId,
    refetchInterval: (query) => {
      const task = query.state.data;
      if (!task) return false;

      // Stop polling if ready or error
      if (task.status === "READY" || task.status === "ERROR") {
        return false;
      }

      // Poll every 3 seconds while task is in progress
      return 3000;
    },
    retry: false,
  });

  // Navigate to conversation ID when task is ready
  useEffect(() => {
    const task = taskQuery.data;
    if (task?.status === "READY" && task.app_conversation_id) {
      const pendingDraft = consumePendingTaskDraft(taskId);
      if (pendingDraft) {
        setConversationState(task.app_conversation_id, {
          draftMessage: pendingDraft,
        });
      }

      // Replace the URL with the actual conversation ID
      navigate(`/conversations/${task.app_conversation_id}`, { replace: true });
    }
  }, [taskQuery.data, navigate, taskId]);

  return {
    isTask,
    taskId,
    conversationId: isTask ? null : (conversationId ?? null),
    task: taskQuery.data,
    taskStatus: taskQuery.data?.status,
    taskDetail: taskQuery.data?.detail,
    taskError: taskQuery.error,
    isLoadingTask: taskQuery.isLoading,
    // Repository information from task request
    repositoryInfo: {
      selectedRepository: taskQuery.data?.request?.selected_repository,
      selectedBranch: taskQuery.data?.request?.selected_branch,
      gitProvider: taskQuery.data?.request?.git_provider,
    },
  };
};
