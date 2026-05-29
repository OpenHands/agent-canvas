import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { ComboboxCaretInline } from "#/ui/combobox-caret";
import { useSwitchLlmProfileAndLog } from "#/hooks/mutation/use-switch-llm-profile-and-log";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useProfileRuntimePlans } from "#/hooks/use-profile-runtime-plans";
import { cn } from "#/utils/utils";
import { SwitchProfileContextMenu } from "./switch-profile-context-menu";

export function SwitchProfileButton() {
  const { t } = useTranslation("openhands");
  const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
  // Null on the home page; `useSwitchLlmProfileAndLog` is fine with that
  // because /api/profiles/<name>/activate is a global endpoint.
  const { conversationId } = useOptionalConversationId();
  const { profiles, activeProfileName, isAcpContext } =
    useProfileRuntimePlans();
  const { switchAndLog, isPending } = useSwitchLlmProfileAndLog();

  const activeProfileModel =
    profiles.find((p) => p.profile.name === activeProfileName)?.profile.model ??
    null;

  // This control is the OpenHands surface. ACP conversations route the model
  // through the ACP picker (`ChatInputModel`), which surfaces these same saved
  // profiles disabled with "Requires a new conversation" — so there is no
  // silent partial application even though this button is hidden there.
  if (profiles.length === 0 || isAcpContext) {
    return null;
  }

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuOpen((open) => !open);
  };

  // Only `switch-live` plans act. `current` is a no-op and `disabled` rows are
  // non-interactive in the menu — the partial-application guard lives both
  // here and in the menu.
  const handleSelect = (profileName: string) => {
    const target = profiles.find((p) => p.profile.name === profileName);
    if (target?.plan.action !== "switch-live") return;
    switchAndLog(conversationId, profileName);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        data-testid="switch-profile-button"
        title={activeProfileModel ?? undefined}
        aria-haspopup="menu"
        aria-expanded={contextMenuOpen}
        className={cn(
          "inline-flex items-center gap-1 rounded-[100px] border border-transparent px-1.5 text-sm font-normal leading-5 text-[var(--oh-muted)] whitespace-nowrap min-w-0 transition-[border-color,background-color,box-shadow,opacity] duration-150 motion-reduce:transition-none max-w-[200px]",
          "hover:text-white hover:bg-white/10 cursor-pointer",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <span className="truncate">
          {activeProfileName ?? t(I18nKey.LLM$SELECT_MODEL_PLACEHOLDER)}
        </span>
        <ComboboxCaretInline isOpen={contextMenuOpen} />
      </button>
      {contextMenuOpen && (
        <SwitchProfileContextMenu
          profiles={profiles}
          onSelect={handleSelect}
          onClose={() => setContextMenuOpen(false)}
        />
      )}
    </div>
  );
}
