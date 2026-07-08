import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { DirectConversationInfo } from "#/api/agent-server-adapter";

interface ForkConversationVariables {
  /** The conversation being branched from. */
  sourceConversationId: string;
  /** The message the action was invoked on. */
  eventId: string;
  /**
   * When set, this is an "edit message" branch: history is copied up to the
   * event *before* `eventId` (so the message is excluded), and this text is
   * the caller's to restore into the composer. When omitted, history is copied
   * up to and including `eventId`.
   */
  editText?: string | null;
  /** Optional title for the fork, so it reads distinctly from its source. */
  title?: string;
}

interface ForkConversationResult {
  info: DirectConversationInfo;
  /**
   * Whether `eventId` was excluded from the fork (edit mode with a resolvable
   * parent). The caller only prefills the composer when this is true, so a send
   * can never duplicate a still-present message.
   */
  excluded: boolean;
}

/**
 * Branches a conversation from a message. For an "edit message" branch
 * (`editText` set) it resolves the message's parent — the events search API
 * omits `parent_id` and the client event store holds un-persisted streaming
 * events, so we ask the single-event endpoint — and branches there, excluding
 * the message. Otherwise it branches at the message (inclusive). The caller
 * navigates to the returned conversation on success. Local agent-server only
 * (see AgentServerConversationService.forkConversation).
 */
export const useForkConversation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["fork-conversation"],
    mutationFn: async ({
      sourceConversationId,
      eventId,
      editText,
      title,
    }: ForkConversationVariables): Promise<ForkConversationResult> => {
      let fromEventId = eventId;
      let excluded = false;

      if (editText != null) {
        const parentId = await AgentServerConversationService.getEventParentId(
          sourceConversationId,
          eventId,
        );
        if (parentId) {
          fromEventId = parentId;
          excluded = true;
        }
      }

      const info = await AgentServerConversationService.forkConversation(
        sourceConversationId,
        fromEventId,
        title,
      );
      return { info, excluded };
    },
    onSuccess: () => {
      // Surface the fork in the sidebar without wiping loaded pages.
      queryClient.invalidateQueries({ queryKey: ["user", "conversations"] });
    },
  });
};
