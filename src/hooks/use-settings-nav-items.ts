import { useConfig } from "#/hooks/query/use-config";
import { useSettings } from "#/hooks/query/use-settings";
import { OSS_NAV_ITEMS, SettingsNavItem } from "#/constants/settings-nav";
import { ACP_PROVIDERS } from "#/constants/acp-providers";
import { isSettingsPageHidden } from "#/utils/settings-utils";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useActiveAgentProfile } from "#/hooks/use-active-agent-profile";

export type SettingsNavRenderedItem =
  | {
      type: "item";
      item: SettingsNavItem;
      disabled?: boolean;
      disabledAgentName?: string;
    }
  | { type: "header"; text: I18nKey }
  | { type: "divider" };

export function useSettingsNavItems(): SettingsNavRenderedItem[] {
  const { data: config } = useConfig();
  const { data: settings } = useSettings();
  const { backend } = useActiveBackend();
  const featureFlags = config?.feature_flags;

  // The active AgentProfile is the source of truth for the current agent kind
  // (activate is pointer-only and never writes agent_settings). Fall back to
  // the global agent settings only while the profile list is loading, so the
  // ACP-incompatible nav items (LLM/condenser/verification) don't briefly
  // enable before the active profile resolves.
  const agentSettings = settings?.agent_settings ?? null;
  const { activeProfile } = useActiveAgentProfile();
  const isAcpAgent =
    (activeProfile?.agent_kind ?? agentSettings?.agent_kind) === "acp";
  const acpServerKey =
    typeof agentSettings?.acp_server === "string"
      ? agentSettings.acp_server
      : undefined;
  // Name the active agent in the disabled-item tooltip: prefer the active
  // profile's name, then the ACP provider display name, then a generic label.
  const acpServerName = isAcpAgent
    ? (activeProfile?.name ??
      ACP_PROVIDERS.find(({ key }) => key === acpServerKey)?.display_name ??
      "ACP Agent")
    : undefined;

  // Agent profiles are available on both local and cloud backends — the cloud
  // enterprise app-server exposes the same `/api/agent-profiles` surface
  // (OpenHands #15060, epic #3730), so the nav item is no longer local-gated.
  return OSS_NAV_ITEMS.filter(
    (item) => !isSettingsPageHidden(item.to, featureFlags),
  ).map((item) => {
    // Local backends present "LLM Profiles" as the section name + subtitle
    // for the ``/settings`` entry; cloud backends keep the canonical "LLM".
    // Apply the rename before the ACP disable check so the disabled tooltip
    // still names the visible label, not a stale one.
    const renamedItem =
      item.to === "/settings"
        ? {
            ...item,
            text:
              backend.kind === "local"
                ? I18nKey.SETTINGS$LLM_PROFILES
                : item.text,
            subtitle:
              backend.kind === "local"
                ? I18nKey.SETTINGS$PAGE_LLM_PROFILES_SUBLINE
                : item.subtitle,
          }
        : item;

    if (isAcpAgent && item.disabledByAcp) {
      return {
        type: "item",
        item: renamedItem,
        disabled: true,
        disabledAgentName: acpServerName,
      };
    }
    return { type: "item", item: renamedItem };
  });
}
