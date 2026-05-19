import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import ChevronDownSmallIcon from "#/icons/chevron-down-small.svg?react";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useSwitchLlmProfileAndLog } from "#/hooks/mutation/use-switch-llm-profile-and-log";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { useModelStore } from "#/stores/model-store";
import { cn } from "#/utils/utils";
import { SwitchProfileContextMenu } from "./switch-profile-context-menu";

export function SwitchProfileButton() {
  const { t } = useTranslation("openhands");
  const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
  // Null on the home page; `useSwitchLlmProfileAndLog` is fine with that
  // because /api/profiles/<name>/activate is a global endpoint.
  const { conversationId } = useOptionalConversationId();
  const { data } = useLlmProfiles();
  const { data: conversation } = useActiveConversation();
  const { data: settings } = useSettings();
  const { switchAndLog, isPending } = useSwitchLlmProfileAndLog();
  // Optimistic value written by recordSwitch on a successful switch — gives
  // instant in-conversation feedback before the conversation refetch lands
  // with the new `llm_model`.
  const optimisticActiveProfile = useModelStore((s) =>
    conversationId ? s.activeProfileByConversation[conversationId] : undefined,
  );

  const profiles = data?.profiles ?? [];
  const conversationModel = conversation?.llm_model ?? null;
  // ACPAgent conversations route prompts to a CLI subprocess whose model is
  // controlled by ``acp_model`` (set in Settings → Agent), not by the LLM
  // profile picker. Surfacing the switcher here would let the user "change
  // the model" while the running subprocess silently keeps its own — a
  // confusing no-op. Hide the button instead. ``toAppConversation`` also
  // nulls ``llm_model`` on this boundary so any other consumer that reads
  // the model directly sees "no model" rather than a misleading value.
  //
  // On the home screen ``conversation`` is undefined; fall back to
  // ``settings.agent_settings.agent_kind`` so the picker also hides when
  // ACP is the *default* the next-created conversation would inherit.
  // Otherwise an ACP user lands on a home page with an LLM-switch
  // control that contradicts the ACP nav gating everywhere else.
  const isAcpActive =
    conversation?.agent_kind === "acp" ||
    (!conversation && settings?.agent_settings?.agent_kind === "acp");

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

  if (profiles.length === 0 || isAcpActive) {
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
        className={cn(
          "inline-flex items-center gap-1 rounded-[100px] border border-transparent px-1.5 text-sm font-normal leading-5 text-[var(--oh-muted)] whitespace-nowrap min-w-0 transition-[border-color,color] max-w-[200px]",
          "hover:text-white hover:bg-white/10 cursor-pointer",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <span className="truncate">
          {activeProfileName ?? t(I18nKey.LLM$SELECT_MODEL_PLACEHOLDER)}
        </span>
        <ChevronDownSmallIcon
          width={18}
          height={18}
          color="currentColor"
          className="shrink-0"
          aria-hidden
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
