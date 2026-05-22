import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import ChevronDownSmallIcon from "#/icons/chevron-down-small.svg?react";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { NavigationLink } from "#/components/shared/navigation-link";
import { ContextMenu } from "#/ui/context-menu";
import { Divider } from "#/ui/divider";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { cn } from "#/utils/utils";
import React from "react";
import { useTranslation } from "react-i18next";

const MODEL_LABEL_MAX_CHARS = 10;

function truncateModelLabel(model: string): string {
  if (model.length <= MODEL_LABEL_MAX_CHARS) {
    return model;
  }
  return `${model.slice(0, MODEL_LABEL_MAX_CHARS)}…`;
}

export function ChatInputModel() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const { data: conversation } = useActiveConversation();
  // Home page has no active conversation; fall back to the user's default
  // model so the switcher renders consistently across both surfaces.
  const { data: settings } = useSettings();
  // ACP conversations do not use the OpenHands LLM profile. Show the ACP
  // model only when the adapter/settings provide one, and link users to Agent
  // settings instead of the LLM profile page.
  const isActiveAcpConversation = conversation?.agent_kind === "acp";
  const isHomeAcp =
    !conversation && settings?.agent_settings?.agent_kind === "acp";
  const settingsAcpModel =
    typeof settings?.agent_settings?.acp_model === "string"
      ? settings.agent_settings.acp_model.trim() || null
      : null;
  const llmModel = isActiveAcpConversation
    ? conversation?.llm_model
    : isHomeAcp
      ? settingsAcpModel
      : (conversation?.llm_model ?? settings?.llm_model);
  const destinationPath =
    isActiveAcpConversation || isHomeAcp ? "/settings/agent" : "/settings";
  const llmDestinationLabel = t(
    isActiveAcpConversation || isHomeAcp
      ? I18nKey.SETTINGS$NAV_AGENT
      : backend.kind === "cloud"
        ? I18nKey.SETTINGS$LLM_SETTINGS
        : I18nKey.SETTINGS$LLM_PROFILES,
  );
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);

  const popoverRef = useClickOutsideElement<HTMLUListElement>(() => {
    setIsPopoverOpen(false);
  });

  if (!llmModel) {
    return null;
  }
  const truncatedModelLabel = truncateModelLabel(llmModel);

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-[100px] border border-transparent px-1.5 text-sm font-normal leading-5 text-[var(--oh-muted)] whitespace-nowrap min-w-0 transition-[border-color,color]",
          "hover:text-white hover:bg-white/10 cursor-pointer",
        )}
        title={llmModel}
        data-testid="chat-input-llm-model"
        aria-expanded={isPopoverOpen}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsPopoverOpen((open) => !open);
        }}
      >
        <span>{truncatedModelLabel}</span>
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
          className="z-[60] mb-2 min-w-[200px] max-w-[320px]"
        >
          <li className="text-sm">
            <div className="p-2 leading-5 text-white break-all">{llmModel}</div>
          </li>
          <Divider />
          <li className="text-sm">
            <NavigationLink
              to={destinationPath}
              onClick={() => setIsPopoverOpen(false)}
              className="flex h-[30px] items-center gap-2 rounded p-2 leading-5 text-white hover:bg-[var(--oh-interactive-hover)] transition-colors"
            >
              <SettingsGearIcon
                width={16}
                height={16}
                className="shrink-0"
                aria-hidden
              />
              <span>{llmDestinationLabel}</span>
            </NavigationLink>
          </li>
        </ContextMenu>
      )}
    </div>
  );
}
