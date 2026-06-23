import { useConfig } from "#/hooks/query/use-config";
import { OSS_NAV_ITEMS, SettingsNavItem } from "#/constants/settings-nav";
import { isSettingsPageHidden } from "#/utils/settings-utils";
import { I18nKey } from "#/i18n/declaration";

export type SettingsNavRenderedItem =
  | {
      type: "item";
      item: SettingsNavItem;
      disabled?: boolean;
      disabledAgentName?: string;
    }
  | { type: "header"; text: I18nKey }
  | { type: "divider" };

// Settings now hosts only cross-cutting items (Application); all agent config
// moved to the Agents hub (`useAgentsHubNavItems`). See #1456.
export function useSettingsNavItems(): SettingsNavRenderedItem[] {
  const { data: config } = useConfig();
  const featureFlags = config?.feature_flags;

  return OSS_NAV_ITEMS.filter(
    (item) => !isSettingsPageHidden(item.to, featureFlags),
  ).map((item) => ({ type: "item", item }));
}
