import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import { useAcpModelContext } from "#/hooks/use-acp-model-context";
import { ComboboxCaretInline } from "#/ui/combobox-caret";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { NavigationLink } from "#/components/shared/navigation-link";
import { ContextMenu } from "#/ui/context-menu";
import { Divider } from "#/ui/divider";
import {
  getAcpProvider,
  labelForAcpModel,
  resolveEffectiveAcpModel,
} from "#/constants/acp-providers";
import { cn } from "#/utils/utils";
import React from "react";

const MODEL_LABEL_MAX_CHARS = 10;
// ACP surfaces show the provider's human label (e.g. "Claude Opus 4.7"),
// which is longer than a raw model id, so the inline button gets a wider cap
// before truncating. The full string still shows in the title + popover.
const ACP_MODEL_LABEL_MAX_CHARS = 22;

function truncateModelLabel(
  model: string,
  maxChars: number = MODEL_LABEL_MAX_CHARS,
): string {
  if (model.length <= maxChars) {
    return model;
  }
  return `${model.slice(0, maxChars)}…`;
}

export function ChatInputModel() {
  const { data: conversation } = useActiveConversation();
  // Home page has no active conversation; fall back to the user's default
  // model so the switcher renders consistently across both surfaces.
  const { data: settings } = useSettings();
  const {
    isActiveAcpConversation,
    isHomeAcp,
    isAcpContext,
    destinationPath,
    destinationLabel,
  } = useAcpModelContext();
  // ACP conversations do not use the OpenHands LLM profile. Resolve the model
  // label through the shared helper so the displayed value matches what the
  // conversation-creation path will actually send to the agent-server (the
  // helper applies provider defaults + filters out the SDK ``"default"``
  // placeholders + the ``"acp-managed"`` sentinel).
  //
  // The ACP server key whose registry owns the model label comes off the
  // active conversation when there is one, else the saved agent settings the
  // next home-page conversation will inherit.
  const acpServerKey = isActiveAcpConversation
    ? conversation?.acp_server
    : isHomeAcp
      ? typeof settings?.agent_settings?.acp_server === "string"
        ? settings.agent_settings.acp_server
        : null
      : null;
  const acpProvider = isHomeAcp ? getAcpProvider(acpServerKey) : undefined;
  let llmModel: string | null | undefined;
  if (isActiveAcpConversation) {
    llmModel = conversation?.llm_model;
  } else if (isHomeAcp) {
    llmModel = resolveEffectiveAcpModel({
      configured:
        typeof settings?.agent_settings?.acp_model === "string"
          ? settings.agent_settings.acp_model
          : null,
      providerDefault: acpProvider?.default_model,
    });
  } else {
    llmModel = conversation?.llm_model ?? settings?.llm_model;
  }
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);

  const popoverRef = useClickOutsideElement<HTMLUListElement>(() => {
    setIsPopoverOpen(false);
  });

  if (!llmModel) {
    return null;
  }
  // For ACP, surface the provider's human label (matching the conversation
  // list chip) instead of the raw ``acp_model`` id; falls back to the raw
  // value for custom / unknown ids. OpenHands keeps the raw model string.
  const displayModel = isAcpContext
    ? (labelForAcpModel(acpServerKey, llmModel) ?? llmModel)
    : llmModel;
  const truncatedModelLabel = truncateModelLabel(
    displayModel,
    isAcpContext ? ACP_MODEL_LABEL_MAX_CHARS : MODEL_LABEL_MAX_CHARS,
  );

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-[100px] border border-transparent px-1.5 text-sm font-normal leading-5 text-[var(--oh-muted)] whitespace-nowrap min-w-0 transition-[border-color,background-color,box-shadow,opacity] duration-150 motion-reduce:transition-none",
          "hover:text-white hover:bg-white/10 cursor-pointer",
        )}
        title={displayModel}
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
        <ComboboxCaretInline isOpen={isPopoverOpen} />
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
            <div className="p-2 leading-5 text-white break-all">
              {displayModel}
            </div>
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
              <span>{destinationLabel}</span>
            </NavigationLink>
          </li>
        </ContextMenu>
      )}
    </div>
  );
}
