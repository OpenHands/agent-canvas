import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocalStorage } from "@uidotdev/usehooks";
import CloseIcon from "#/icons/close.svg?react";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useUpdateWorkConversationTools } from "#/hooks/mutation/use-update-work-conversation-tools";
import { useApplyWorkToolResult } from "#/hooks/use-apply-work-tool-result";
import { I18nKey } from "#/i18n/declaration";
import {
  getAvailableWorkOptionalTools,
  getWorkOptionalToolDefinition,
  isWorkOptionalToolAvailable,
  type WorkOptionalToolId,
} from "#/types/work-tools";
import {
  getWorkEnabledOptionalToolIds,
  isWorkConversation,
} from "#/utils/work-conversations";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

function dismissStorageKey(conversationId: string): string {
  return `work-conversation-tools-dismissed:${conversationId}`;
}

export function WorkConversationToolsBar() {
  const { t } = useTranslation("openhands");
  const { data: conversation } = useActiveConversation();
  const applyResult = useApplyWorkToolResult();
  const { mutateAsync: updateTools, isPending } =
    useUpdateWorkConversationTools();

  const conversationId = conversation?.id ?? "";
  const [isDismissed, setIsDismissed] = useLocalStorage(
    dismissStorageKey(conversationId || "pending"),
    false,
  );

  const isWorkTask = isWorkConversation(conversation?.tags);
  const enabledToolIds = getWorkEnabledOptionalToolIds(conversation?.tags);
  const pendingTools = getAvailableWorkOptionalTools().filter(
    (tool) =>
      isWorkOptionalToolAvailable(tool.id) && !enabledToolIds.includes(tool.id),
  );

  const handleEnable = useCallback(
    async (toolId: WorkOptionalToolId) => {
      if (!conversation) {
        return;
      }

      const nextEnabled = Array.from(
        new Set([...enabledToolIds, toolId]),
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
          toolLabel: t(
            (getWorkOptionalToolDefinition(toolId)?.labelKey ??
              I18nKey.WORK$TOOL_BROWSER_LABEL) as I18nKey,
          ),
          existingTags: conversation.tags,
        });
      } catch {
        displayErrorToast(t(I18nKey.WORK$TOOL_GRANT_FAILED));
      }
    },
    [applyResult, conversation, enabledToolIds, t, updateTools],
  );

  if (
    !isWorkTask ||
    !conversationId ||
    isDismissed ||
    pendingTools.length === 0
  ) {
    return null;
  }

  return (
    <div
      className="mb-2 flex items-center gap-2 rounded-md border border-[var(--oh-border-input)] bg-[var(--oh-surface-raised)] px-2.5 py-1.5"
      data-testid="work-conversation-tools-bar"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {pendingTools.map((tool) => (
          <div
            key={tool.id}
            className="inline-flex items-center gap-2 text-xs text-foreground"
            data-testid={`work-conversation-tool-${tool.id}`}
          >
            <span>{t(tool.labelKey as I18nKey)}</span>
            <SettingsSwitch
              testId={`work-conversation-tool-${tool.id}-switch`}
              isToggled={false}
              isDisabled={isPending}
              onToggle={(checked) => {
                if (checked) {
                  handleEnable(tool.id);
                }
              }}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        data-testid="work-conversation-tools-dismiss"
        aria-label={t(I18nKey.WORK$TOOLS_CONVERSATION_DISMISS)}
        onClick={() => setIsDismissed(true)}
        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-base text-tertiary-light hover:text-foreground"
      >
        <CloseIcon aria-hidden />
      </button>
    </div>
  );
}
