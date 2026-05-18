import { useConfig } from "#/hooks/query/use-config";
import { useSettings } from "#/hooks/query/use-settings";
import { OSS_NAV_ITEMS, SettingsNavItem } from "#/constants/settings-nav";
import { ACP_PROVIDERS } from "#/constants/acp-providers";
import { isSettingsPageHidden } from "#/utils/settings-utils";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackend } from "#/contexts/active-backend-context";

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

  const agentSettings = settings?.agent_settings ?? null;
  const isAcpAgent = agentSettings?.agent_kind === "acp";
  const acpServerKey =
    typeof agentSettings?.acp_server === "string"
      ? agentSettings.acp_server
      : undefined;
  const acpServerName = isAcpAgent
    ? (ACP_PROVIDERS.find(({ key }) => key === acpServerKey)?.display_name ??
      "ACP Agent")
    : undefined;

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
