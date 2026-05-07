import { useConfig } from "#/hooks/query/use-config";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { OSS_NAV_ITEMS, SettingsNavItem } from "#/constants/settings-nav";
import {
  isLocalOnlySettingsPath,
  isSettingsPageHidden,
} from "#/utils/settings-utils";
import { I18nKey } from "#/i18n/declaration";

export type SettingsNavRenderedItem =
  | { type: "item"; item: SettingsNavItem }
  | { type: "header"; text: I18nKey }
  | { type: "divider" };

export function useSettingsNavItems(): SettingsNavRenderedItem[] {
  const { data: config } = useConfig();
  const featureFlags = config?.feature_flags;
  const active = useActiveBackend();
  const isCloud = active.backend.kind === "cloud";

  return OSS_NAV_ITEMS.filter(
    (item) =>
      !isSettingsPageHidden(item.to, featureFlags) &&
      !(isCloud && isLocalOnlySettingsPath(item.to)),
  ).map((item) => ({ type: "item", item }));
}
