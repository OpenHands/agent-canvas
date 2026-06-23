import { useConfig } from "#/hooks/query/use-config";
import { AGENTS_HUB_NAV_ITEMS } from "#/constants/settings-nav";
import { isSettingsPageHidden } from "#/utils/settings-utils";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackend } from "#/contexts/active-backend-context";
import type { SettingsNavRenderedItem } from "#/hooks/use-settings-nav-items";

/**
 * Nav for the Agents hub (#1456): the profile library plus the "Building
 * blocks" catalogs (LLM / MCP / Skills / Plugins / Secrets). Grouped with
 * headers so the two layers — compose vs. define-once — read at a glance.
 */
export function useAgentsHubNavItems(): SettingsNavRenderedItem[] {
  const { data: config } = useConfig();
  const { backend } = useActiveBackend();
  const featureFlags = config?.feature_flags;

  const rendered: SettingsNavRenderedItem[] = [
    { type: "header", text: I18nKey.SETTINGS$AGENTS_HUB_PROFILES_HEADER },
  ];

  let blocksHeaderInserted = false;
  for (const item of AGENTS_HUB_NAV_ITEMS) {
    if (isSettingsPageHidden(item.to, featureFlags)) continue;

    // Everything after the profile library is a reusable building block.
    if (item.to !== "/agents/profiles" && !blocksHeaderInserted) {
      rendered.push({
        type: "header",
        text: I18nKey.SETTINGS$AGENTS_HUB_BUILDING_BLOCKS_HEADER,
      });
      blocksHeaderInserted = true;
    }

    // Local backends present "LLM Profiles"; cloud keeps the canonical "LLM".
    const renamedItem =
      item.to === "/agents/llm" && backend.kind === "local"
        ? {
            ...item,
            text: I18nKey.SETTINGS$LLM_PROFILES,
            subtitle: I18nKey.SETTINGS$PAGE_LLM_PROFILES_SUBLINE,
          }
        : item;

    rendered.push({ type: "item", item: renamedItem });
  }

  return rendered;
}
