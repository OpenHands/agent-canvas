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
  // ACPAgent conversations have no OpenHands LLM (the model lives on the
  // ACP subprocess via ``acp_model``), so ``toAppConversation`` writes a
  // null ``llm_model`` for them. Don't fall back to ``settings.llm_model``
  // here — that would resurrect the user's *default* OpenHands model on a
  // Claude-Code conversation and link to /settings, both of which lie
  // about what model is actually running.
  //
  // On the home screen ``conversation`` is undefined, so we also have to
  // consult ``settings.agent_settings.agent_kind`` — that's the kind the
  // next-created conversation will inherit. Without the fallback, ACP
  // users would still see the LLM-profile control on the home page,
  // contradicting the ACP nav gating elsewhere.
  const isAcpActive =
    conversation?.agent_kind === "acp" ||
    (!conversation && settings?.agent_settings?.agent_kind === "acp");
  const llmModel = isAcpActive
    ? null
    : (conversation?.llm_model ?? settings?.llm_model);
  const llmDestinationLabel = t(
    backend.kind === "cloud"
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
              <span>{llmDestinationLabel}</span>
            </NavigationLink>
          </li>
        </ContextMenu>
      )}
    </div>
  );
}
