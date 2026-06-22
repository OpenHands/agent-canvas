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
  const isLocal = backend.kind === "local";

  // Condenser and Verification are OpenHands-only agent settings, now configured
  // per-profile in the Agent Profiles editor — so drop their standalone pages on
  // local. Cloud has no AgentProfile surface yet (#3730), so it keeps them.
  const localPerProfilePages = new Set([
    "/settings/condenser",
    "/settings/verification",
  ]);

  return OSS_NAV_ITEMS.filter(
    (item) =>
      !isSettingsPageHidden(item.to, featureFlags) &&
      !(isLocal && localPerProfilePages.has(item.to)),
  ).map((item) => {
    // Local backends present "LLM Profiles" as the section name + subtitle for
    // the LLM entry; cloud backends keep the canonical "LLM".
    if (item.to === "/settings/llm" && isLocal) {
      return {
        type: "item",
        item: {
          ...item,
          text: I18nKey.SETTINGS$LLM_PROFILES,
          subtitle: I18nKey.SETTINGS$PAGE_LLM_PROFILES_SUBLINE,
        },
      };
    }

    // On local the single "Agent" tab IS the AgentProfile library: conversations
    // launch from the active profile (#3727), so the legacy global agent-settings
    // page (`/settings/agent`) is superseded and dropped from the nav (still
    // reachable by direct URL). Cloud has no AgentProfile surface yet (#3730),
    // so it keeps the legacy page.
    if (item.to === "/settings/agent" && isLocal) {
      return {
        type: "item",
        item: {
          ...item,
          to: "/settings/agents",
          text: I18nKey.SETTINGS$NAV_AGENT_PROFILES,
          subtitle: I18nKey.SETTINGS$PAGE_AGENT_PROFILES_SUBLINE,
        },
      };
    }

    return { type: "item", item };
  });
}
