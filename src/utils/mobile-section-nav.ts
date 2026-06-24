import { I18nKey } from "#/i18n/declaration";

const AGENTS_HUB = "/agents";

export type MobileTopBarMode = "menu" | "back";

export interface MobileTopBarState {
  mode: MobileTopBarMode;
  backTo?: string;
  backLabelKey?: I18nKey;
}

/**
 * Drives the mobile top bar: the hamburger menu on hub landings, a contextual
 * "back to hub" arrow on a hub's sub-pages. After the Settings/Customize hubs
 * were folded into the Agents hub (#1456), `/agents` is the one multi-section
 * area whose sub-pages need that back affordance on mobile (the desktop section
 * sidebar is `hidden md:flex`).
 */
export function getMobileTopBarState(pathname: string): MobileTopBarState {
  if (pathname === AGENTS_HUB) {
    return { mode: "menu" };
  }

  if (pathname.startsWith(`${AGENTS_HUB}/`)) {
    return {
      mode: "back",
      backTo: AGENTS_HUB,
      backLabelKey: I18nKey.NAV$AGENTS,
    };
  }

  return { mode: "menu" };
}
