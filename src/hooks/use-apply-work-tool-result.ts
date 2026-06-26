import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkConversationToolsUpdateResult } from "#/api/conversation-service/agent-server-conversation-service.api";
import { useSendMessage } from "#/hooks/use-send-message";
import { I18nKey } from "#/i18n/declaration";
import {
  getWorkToolsNavigationTarget,
  shouldSendWorkToolApprovalMessage,
} from "#/utils/work-tool-apply-result";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

interface ApplyWorkToolResultOptions {
  sourceConversationId: string;
  toolLabel: string;
  existingTags?: Record<string, string> | null;
}

export function useApplyWorkToolResult() {
  const navigate = useNavigate();
  const { t } = useTranslation("openhands");
  const { send } = useSendMessage();
  const queryClient = useQueryClient();

  return useCallback(
    async (
      result: WorkConversationToolsUpdateResult,
      options: ApplyWorkToolResultOptions,
    ) => {
      if (!result.toolsApplied) {
        displayErrorToast(t(I18nKey.WORK$TOOL_REQUIRES_NEW_TASK));
        return;
      }

      if (result.appliedVia === "recreate") {
        await queryClient.invalidateQueries({
          queryKey: ["user", "conversations"],
        });
        displaySuccessToast(t(I18nKey.WORK$TOOL_RECREATED_MESSAGE));
        navigate(
          getWorkToolsNavigationTarget(
            result,
            options.sourceConversationId,
            options.existingTags,
          ) ?? `/work/tasks/${result.conversationId}`,
        );
        return;
      }

      const navigationTarget = getWorkToolsNavigationTarget(
        result,
        options.sourceConversationId,
        options.existingTags,
      );

      if (shouldSendWorkToolApprovalMessage(result)) {
        await send({
          action: "message",
          args: {
            content: t(I18nKey.WORK$TOOL_REQUEST_APPROVED_MESSAGE, {
              tool: options.toolLabel,
            }),
          },
        });
      }

      if (navigationTarget) {
        navigate(navigationTarget);
      }
    },
    [navigate, queryClient, send, t],
  );
}
