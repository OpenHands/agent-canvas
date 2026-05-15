import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import ChevronDownSmallIcon from "#/icons/chevron-down-small.svg?react";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { NavigationLink } from "#/components/shared/navigation-link";
import { ContextMenu } from "#/ui/context-menu";
import { Divider } from "#/ui/divider";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import React from "react";
import { useTranslation } from "react-i18next";

export function ChatInputModel() {
  const { t } = useTranslation("openhands");
  const { data: conversation } = useActiveConversation();
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);

  const popoverRef = useClickOutsideElement<HTMLUListElement>(() => {
    setIsPopoverOpen(false);
  });

  if (!conversation?.llm_model) {
    return null;
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-[100px] border border-transparent px-1.5 text-sm font-normal leading-5 text-[var(--oh-muted)] whitespace-nowrap min-w-0 transition-[border-color,color]",
          "hover:text-white hover:bg-white/10 cursor-pointer",
        )}
        title={conversation.llm_model}
        data-testid="chat-input-llm-model"
        aria-expanded={isPopoverOpen}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsPopoverOpen((open) => !open);
        }}
      >
        <span>{conversation.llm_model}</span>
        <ChevronDownSmallIcon
          width={18}
          height={18}
          color="currentColor"
          className="shrink-0"
          aria-hidden
        />
      </button>

      {isPopoverOpen && (
        <ContextMenu
          ref={popoverRef}
          testId="chat-input-llm-model-popover"
          position="top"
          alignment="left"
          spacing="none"
          className="z-[60] mb-2 min-w-[200px]"
        >
          <li className="text-sm">
            <div className="p-2 leading-5 text-white break-all">
              {conversation.llm_model}
            </div>
          </li>
          <Divider />
          <li className="text-sm">
            <NavigationLink
              to="/settings"
              onClick={() => setIsPopoverOpen(false)}
              className="flex h-[30px] items-center gap-2 rounded p-2 leading-5 text-white hover:bg-[var(--oh-interactive-hover)] transition-colors"
            >
              <SettingsGearIcon
                width={16}
                height={16}
                className="shrink-0"
                aria-hidden
              />
              <span>{t(I18nKey.SETTINGS$LLM_SETTINGS)}</span>
            </NavigationLink>
          </li>
        </ContextMenu>
      )}
    </div>
  );
}
