import React from "react";
import { useTranslation } from "react-i18next";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import ChevronDownSmallIcon from "#/icons/chevron-down-small.svg?react";
import CircuitIcon from "#/icons/u-circuit.svg?react";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useSwitchLlmProfileAndLog } from "#/hooks/mutation/use-switch-llm-profile-and-log";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useModelStore } from "#/stores/model-store";
import { SwitchProfileContextMenu } from "./switch-profile-context-menu";

export function SwitchProfileButton() {
  const { t } = useTranslation("openhands");
  const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
  // Null on the home page; `useSwitchLlmProfileAndLog` is fine with that
  // because /api/profiles/<name>/activate is a global endpoint.
  const { conversationId } = useOptionalConversationId();
  const { data } = useLlmProfiles();
  const { data: conversation } = useActiveConversation();
  const { switchAndLog, isPending } = useSwitchLlmProfileAndLog();
  // Optimistic value written by recordSwitch on a successful switch — gives
  // instant in-conversation feedback before the conversation refetch lands
  // with the new `llm_model`.
  const optimisticActiveProfile = useModelStore((s) =>
    conversationId ? s.activeProfileByConversation[conversationId] : undefined,
  );

  const profiles = data?.profiles ?? [];
  const conversationModel = conversation?.llm_model ?? null;

  // Resolution priority for the active profile name:
  //   1. Optimistic (just-clicked) — instant feedback before the refetch.
  //   2. Profile whose model matches the running llm_model — cold loads.
  //   3. User-level active_profile — home page / before the conversation has
  //      sent any messages.
  const activeProfileName =
    optimisticActiveProfile ??
    (conversationModel
      ? (profiles.find((p) => p.model === conversationModel)?.name ?? null)
      : (data?.active_profile ?? null));
  const activeProfileModel =
    profiles.find((p) => p.name === activeProfileName)?.model ??
    conversationModel ??
    null;

  if (profiles.length === 0) {
    return null;
  }

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenuOpen((open) => !open);
  };

  const handleSelect = (profileName: string) => {
    if (profileName === activeProfileName) return;
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
        className="flex items-center gap-1 border border-[#4B505F] rounded-[100px] transition-opacity cursor-pointer hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed pl-2 max-w-[200px]"
      >
        <CircuitIcon
          width={16}
          height={16}
          color="#ffffff"
          className="shrink-0"
        />
        <Typography.Text className="text-white text-sm not-italic font-normal leading-5 truncate">
          {activeProfileName ?? t(I18nKey.LLM$SELECT_MODEL_PLACEHOLDER)}
        </Typography.Text>
        <ChevronDownSmallIcon
          width={24}
          height={24}
          color="#ffffff"
          className="shrink-0"
        />
      </button>
      {contextMenuOpen && (
        <SwitchProfileContextMenu
          profiles={profiles}
          activeProfileName={activeProfileName}
          onSelect={handleSelect}
          onClose={() => setContextMenuOpen(false)}
        />
      )}
    </div>
  );
}
