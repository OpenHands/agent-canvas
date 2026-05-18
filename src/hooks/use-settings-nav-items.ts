import { useConfig } from "#/hooks/query/use-config";
import { OSS_NAV_ITEMS, SettingsNavItem } from "#/constants/settings-nav";
import { isSettingsPageHidden } from "#/utils/settings-utils";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackend } from "#/contexts/active-backend-context";

export type SettingsNavRenderedItem =
  | { type: "item"; item: SettingsNavItem }
  | { type: "header"; text: I18nKey }
  | { type: "divider" };

export function useSettingsNavItems(): SettingsNavRenderedItem[] {
  const { data: config } = useConfig();
  const { backend } = useActiveBackend();
  const featureFlags = config?.feature_flags;

  return OSS_NAV_ITEMS.filter(
    (item) => !isSettingsPageHidden(item.to, featureFlags),
  ).map((item) => {
    if (item.to !== "/settings") {
      return { type: "item", item };
    }

    return {
      type: "item",
      item: {
        ...item,
        text:
          backend.kind === "local" ? I18nKey.SETTINGS$LLM_PROFILES : item.text,
        subtitle:
          backend.kind === "local"
            ? I18nKey.SETTINGS$PAGE_LLM_PROFILES_SUBLINE
            : item.subtitle,
      },
    };
  });
}
