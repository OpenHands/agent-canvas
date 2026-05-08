import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { I18nKey } from "#/i18n/declaration";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";

export const useUpdateConversationPublicFlag = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (variables: { conversationId: string; isPublic: boolean }) =>
      AgentServerConversationService.updateConversationPublicFlag(
        variables.conversationId,
        variables.isPublic,
      ),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: ["user", "conversation", variables.conversationId],
      });

      const previousConversation = queryClient.getQueryData([
        "user",
        "conversation",
        variables.conversationId,
      ]);

      queryClient.setQueryData(
        ["user", "conversation", variables.conversationId],
        (old: unknown) =>
          old && typeof old === "object"
            ? { ...old, public: variables.isPublic }
            : old,
      );

      return { previousConversation };
    },
    onError: (_err, variables, context) => {
      if (context?.previousConversation) {
        queryClient.setQueryData(
          ["user", "conversation", variables.conversationId],
          context.previousConversation,
        );
      }
      displayErrorToast(
        t(I18nKey.CONVERSATION$FAILED_TO_UPDATE_PUBLIC_SHARING),
      );
    },
    onSuccess: () => {
      displaySuccessToast(t(I18nKey.CONVERSATION$PUBLIC_SHARING_UPDATED));
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["user", "conversation", variables.conversationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["user", "conversations"],
      });
    },
  });
};
