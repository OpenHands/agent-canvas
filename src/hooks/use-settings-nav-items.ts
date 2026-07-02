import { useConfig } from "#/hooks/query/use-config";
import { OSS_NAV_ITEMS, SettingsNavItem } from "#/constants/settings-nav";
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
  const { backend } = useActiveBackend();
  const featureFlags = config?.feature_flags;

  // The per-profile AgentProfile editor (#3726) replaces the global ACP nav
  // lockout: every Settings page is now configurable regardless of agent kind,
  // so there is no longer an ACP-driven disable/redirect.
  return OSS_NAV_ITEMS.filter((item) => {
    if (isSettingsPageHidden(item.to, featureFlags)) return false;
    // AgentProfiles are local-first: the cloud app-server has no
    // /api/agent-profiles surface yet (#3730), so the library is hidden on
    // cloud backends (matches the local-only chat picker + launch gating).
    if (item.to === "/settings/agents" && backend.kind === "cloud") {
      return false;
    }
    return true;
  }).map((item) => {
    // Local backends present "LLM Profiles" as the section name + subtitle for
    // the LLM entry; cloud backends keep the canonical "LLM".
    const renamedItem =
      item.to === "/settings/llm"
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

    return { type: "item", item: renamedItem };
  });
}
