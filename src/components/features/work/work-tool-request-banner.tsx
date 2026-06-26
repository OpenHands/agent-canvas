import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActionTooltip } from "#/components/shared/action-tooltip";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useUpdateWorkConversationTools } from "#/hooks/mutation/use-update-work-conversation-tools";
import { useApplyWorkToolResult } from "#/hooks/use-apply-work-tool-result";
import { useSendMessage } from "#/hooks/use-send-message";
import { I18nKey } from "#/i18n/declaration";
import { useWorkToolRequestStore } from "#/stores/work-tool-request-store";
import {
  getWorkOptionalToolDefinition,
  isWorkOptionalToolAvailable,
  parseWorkToolRequests,
  type WorkOptionalToolId,
} from "#/types/work-tools";
import { getWorkEnabledOptionalToolIds } from "#/utils/work-conversations";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

interface WorkToolRequestBannerProps {
  eventId: string;
  messageText: string;
}

export function WorkToolRequestBanner({
  eventId,
  messageText,
}: WorkToolRequestBannerProps) {
  const { t } = useTranslation("openhands");
  const { data: conversation } = useActiveConversation();
  const { send } = useSendMessage();
  const applyResult = useApplyWorkToolResult();
  const { mutateAsync: updateTools, isPending } =
    useUpdateWorkConversationTools();
  const dismissedEventIds = useWorkToolRequestStore(
    (state) => state.dismissedEventIds,
  );
  const dismissEvent = useWorkToolRequestStore((state) => state.dismissEvent);

  const pendingRequests = useMemo(
    () => parseWorkToolRequests(messageText),
    [messageText],
  );

  const enabledToolIds = getWorkEnabledOptionalToolIds(conversation?.tags);

  const actionableRequest = pendingRequests.find(
    (request) =>
      isWorkOptionalToolAvailable(request.toolId) &&
      !enabledToolIds.includes(request.toolId),
  );

  const handleDecision = useCallback(
    async (accept: boolean) => {
      if (!conversation || !actionableRequest) {
        return;
      }

      dismissEvent(eventId);

      const label = t(
        (getWorkOptionalToolDefinition(actionableRequest.toolId)?.labelKey ??
          I18nKey.WORK$TOOL_BROWSER_LABEL) as I18nKey,
      );

      if (!accept) {
        await send({
          action: "message",
          args: {
            content: t(I18nKey.WORK$TOOL_REQUEST_DECLINED_MESSAGE, {
              tool: label,
            }),
          },
        });
        return;
      }

      const nextEnabled = Array.from(
        new Set([...enabledToolIds, actionableRequest.toolId]),
      ) as WorkOptionalToolId[];

      try {
        const result = await updateTools({
          conversationId: conversation.id,
          enabledOptionalToolIds: nextEnabled,
          conversationUrl: conversation.conversation_url,
          sessionApiKey: conversation.session_api_key,
          existingTags: conversation.tags,
        });

        await applyResult(result, {
          sourceConversationId: conversation.id,
          toolLabel: label,
          existingTags: conversation.tags,
        });
      } catch {
        displayErrorToast(t(I18nKey.WORK$TOOL_GRANT_FAILED));
      }
    },
    [
      actionableRequest,
      applyResult,
      conversation,
      dismissEvent,
      enabledToolIds,
      eventId,
      send,
      t,
      updateTools,
    ],
  );

  if (!actionableRequest || dismissedEventIds.includes(eventId) || isPending) {
    return null;
  }

  const label = t(
    (getWorkOptionalToolDefinition(actionableRequest.toolId)?.labelKey ??
      I18nKey.WORK$TOOL_BROWSER_LABEL) as I18nKey,
  );

  return (
    <div
      className="flex flex-col gap-2 pt-4"
      data-testid={`work-tool-request-${actionableRequest.toolId}`}
    >
      <p className="text-sm font-normal text-white">
        {actionableRequest.reason
          ? t(I18nKey.WORK$TOOL_REQUEST_WITH_REASON, {
              tool: label,
              reason: actionableRequest.reason,
            })
          : t(I18nKey.WORK$TOOL_REQUEST_PROMPT, { tool: label })}
      </p>
      <div className="flex justify-end items-center gap-3">
        <ActionTooltip type="reject" onClick={() => handleDecision(false)} />
        <ActionTooltip type="confirm" onClick={() => handleDecision(true)} />
      </div>
    </div>
  );
}
