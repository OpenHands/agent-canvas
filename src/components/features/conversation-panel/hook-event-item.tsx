import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Typography } from "#/ui/typography";
import { HookEvent } from "#/api/conversation-service/agent-server-conversation-service.types";
import { HookMatcherContent } from "./hook-matcher-content";
import { I18nKey } from "#/i18n/declaration";

interface HookEventItemProps {
  hookEvent: HookEvent;
  isExpanded: boolean;
  onToggle: (eventType: string) => void;
}

const EVENT_TYPE_I18N_KEYS: Record<string, I18nKey> = {
  pre_tool_use: I18nKey.HOOKS_MODAL$EVENT_PRE_TOOL_USE,
  post_tool_use: I18nKey.HOOKS_MODAL$EVENT_POST_TOOL_USE,
  user_prompt_submit: I18nKey.HOOKS_MODAL$EVENT_USER_PROMPT_SUBMIT,
  session_start: I18nKey.HOOKS_MODAL$EVENT_SESSION_START,
  session_end: I18nKey.HOOKS_MODAL$EVENT_SESSION_END,
  stop: I18nKey.HOOKS_MODAL$EVENT_STOP,
};

export function HookEventItem({
  hookEvent,
  isExpanded,
  onToggle,
}: HookEventItemProps) {
  const { t } = useTranslation("openhands");
  const i18nKey = EVENT_TYPE_I18N_KEYS[hookEvent.event_type];
  const eventTypeLabel = i18nKey ? t(i18nKey) : hookEvent.event_type;

  const totalHooks = hookEvent.matchers.reduce(
    (sum, matcher) => sum + (matcher.hooks ?? []).length,
    0,
  );

  return (
    <div className="rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(hookEvent.event_type)}
        className="w-full py-3 px-2 text-left flex items-center justify-between hover:bg-tertiary transition-colors"
      >
        <div className="flex items-center">
          <Typography.Text className="font-bold text-content-2">
            {eventTypeLabel}
          </Typography.Text>
        </div>
        <div className="flex items-center">
          <Typography.Text className="px-2 py-1 text-xs rounded-full bg-[var(--oh-surface)] mr-2">
            {t(I18nKey.HOOKS_MODAL$HOOK_COUNT, { count: totalHooks })}
          </Typography.Text>
          <Typography.Text className="text-[var(--oh-text-tertiary)]">
            {isExpanded ? (
              <ChevronDown size={18} />
            ) : (
              <ChevronRight size={18} />
            )}
          </Typography.Text>
        </div>
      </button>

      {isExpanded && (
        <div className="px-2 pb-3 pt-1">
          {hookEvent.matchers.map((matcher, index) => (
            <HookMatcherContent
              key={`${hookEvent.event_type}-${matcher.matcher}-${index}`}
              matcher={matcher}
            />
          ))}
        </div>
      )}
    </div>
  );
}
