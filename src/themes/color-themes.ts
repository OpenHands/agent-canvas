import {
  type ResolvedAppearance,
  readPersistedAppearanceMode,
  resolveAppearance,
} from "#/themes/appearance";

export type ColorThemeKey =
  | "codex"
  | "openhands-deepsea"
  | "openhands-neutral"
  | "openhands-neo";

/** A concrete palette for one appearance (light or dark). */
export interface ColorThemeVariant {
  /** Overrides for --cool-grey-* CSS custom properties (our semantic scale) */
  scale: Record<string, string>;
  /**
   * Overrides for --heroui-* CSS custom properties.
   * HeroUI stores colors as space-separated HSL channels ("H S% L%") so Tailwind
   * utilities like bg-default-200 resolve to hsl(var(--heroui-default-200)).
   * These vars are set by the heroui() plugin on :root, [data-theme=dark] at
   * build time, so they must be overridden at the same or lower specificity
   * from a later stylesheet to pick up theme changes at runtime.
   */
  heroui: Record<string, string>;
  /**
   * Overrides for --oh-* semantic tokens — brand/button colors plus literal
   * tokens (radius, shadows, focus ring) that are NOT var(--cool-grey-*)
   * references and so cannot flow from a scale override. Applied via
   * element.style so they beat the inline defaults on the scope root.
   */
  tokens?: Record<string, string>;
  /** Native color-scheme hint (form controls, scrollbars). Defaults to dark. */
  colorScheme?: ResolvedAppearance;
}

export interface ColorThemeDefinition extends ColorThemeVariant {
  label: string;
  /**
   * Optional light palette. When present and the resolved appearance is
   * "light", this variant is used instead of the base (dark) palette. Themes
   * without a light variant always render dark regardless of appearance mode.
   */
  light?: ColorThemeVariant;
}

// HSL channel strings for the neutral grey palette (H=0, S=0%, L=hex/255*100)
// prettier-ignore
const NEUTRAL_HSL = {
  50:  "0 0% 96.86%", // #F7F7F7
  100: "0 0% 92.55%", // #ECECEC
  200: "0 0% 86.27%", // #DCDCDC
  300: "0 0% 74.51%", // #BEBEBE
  400: "0 0% 59.22%", // #979797
  500: "0 0% 45.1%",  // #737373
  600: "0 0% 33.73%", // #565656
  700: "0 0% 25.1%",  // #404040
  800: "0 0% 19.22%", // #313131
  850: "0 0% 15.69%", // #282828
  900: "0 0% 12.55%", // #202020
  950: "0 0% 9.41%",  // #181818
  975: "0 0% 6.27%",  // #101010
};

const NEUTRAL_SCALE = {
  "--cool-grey-50": "#F7F7F7",
  "--cool-grey-100": "#ECECEC",
  "--cool-grey-200": "#DCDCDC",
  "--cool-grey-300": "#BEBEBE",
  "--cool-grey-400": "#979797",
  "--cool-grey-500": "#737373",
  "--cool-grey-600": "#565656",
  "--cool-grey-700": "#404040",
  "--cool-grey-800": "#313131",
  "--cool-grey-900": "#282828",
  "--cool-grey-925": "#202020",
  "--cool-grey-950": "#181818",
  "--cool-grey-975": "#101010",
};

const NEUTRAL_HEROUI = {
  "--heroui-background": NEUTRAL_HSL[950],
  "--heroui-background-foreground": NEUTRAL_HSL[50],
  "--heroui-foreground-50": NEUTRAL_HSL[975],
  "--heroui-foreground-100": NEUTRAL_HSL[950],
  "--heroui-foreground-200": NEUTRAL_HSL[900],
  "--heroui-foreground-300": NEUTRAL_HSL[850],
  "--heroui-foreground-400": NEUTRAL_HSL[800],
  "--heroui-foreground-500": NEUTRAL_HSL[700],
  "--heroui-foreground-600": NEUTRAL_HSL[600],
  "--heroui-foreground-700": NEUTRAL_HSL[500],
  "--heroui-foreground-800": NEUTRAL_HSL[400],
  "--heroui-foreground-900": NEUTRAL_HSL[300],
  "--heroui-foreground": NEUTRAL_HSL[300],
  "--heroui-content1": NEUTRAL_HSL[900],
  "--heroui-content1-foreground": NEUTRAL_HSL[100],
  "--heroui-content2": NEUTRAL_HSL[850],
  "--heroui-content2-foreground": NEUTRAL_HSL[200],
  "--heroui-content3": NEUTRAL_HSL[800],
  "--heroui-content3-foreground": NEUTRAL_HSL[300],
  "--heroui-content4": NEUTRAL_HSL[700],
  "--heroui-content4-foreground": NEUTRAL_HSL[400],
  "--heroui-default-50": NEUTRAL_HSL[975],
  "--heroui-default-100": NEUTRAL_HSL[950],
  "--heroui-default-200": NEUTRAL_HSL[900],
  "--heroui-default-300": NEUTRAL_HSL[850],
  "--heroui-default-400": NEUTRAL_HSL[800],
  "--heroui-default-500": NEUTRAL_HSL[700],
  "--heroui-default-600": NEUTRAL_HSL[600],
  "--heroui-default-700": NEUTRAL_HSL[500],
  "--heroui-default-800": NEUTRAL_HSL[400],
  "--heroui-default-900": NEUTRAL_HSL[300],
  "--heroui-default-foreground": NEUTRAL_HSL[50],
  "--heroui-default": NEUTRAL_HSL[800],
};

import { AGENT_SERVER_UI_THEMEABLE_BRAND_VARIABLES } from "#/styles/agent-server-ui-style-scope";

/** CSS custom properties overridden by color themes (see applyColorTheme). */
export const COLOR_THEME_TOKEN_KEYS = AGENT_SERVER_UI_THEMEABLE_BRAND_VARIABLES;

/** White primary/accent tokens — used by OpenHands-Neo for button surfaces. */
const NEO_WHITE_BUTTON_TOKENS: Record<
  (typeof COLOR_THEME_TOKEN_KEYS)[number],
  string
> = {
  "--oh-color-primary": "#ffffff",
  "--oh-accent": "#ffffff",
  "--oh-warning": "#ffffff",
};

// ── Codex palettes ──────────────────────────────────────────────────────────
// The cool-grey ramp is a single lightness axis: low stops are used for text /
// foreground, high stops for surfaces / background. Dark mode keeps that
// orientation (50 lightest → 975 darkest); light mode inverts it (50 darkest →
// 950 near-white) so every var(--cool-grey-*) reference flips automatically.

const CODEX_DARK_SCALE = {
  "--cool-grey-50": "#FAFAFA",
  "--cool-grey-100": "#EDEDED",
  "--cool-grey-200": "#D6D6D6",
  "--cool-grey-300": "#B4B4B4",
  "--cool-grey-400": "#8A8A8A",
  "--cool-grey-500": "#6E6E6E",
  "--cool-grey-600": "#545454",
  "--cool-grey-700": "#2E2E2E",
  "--cool-grey-800": "#242424",
  "--cool-grey-900": "#181818",
  "--cool-grey-925": "#141414",
  "--cool-grey-950": "#0E0E0E",
  "--cool-grey-975": "#080808",
};

const CODEX_LIGHT_SCALE = {
  "--cool-grey-50": "#0D0D0D",
  "--cool-grey-100": "#171717",
  "--cool-grey-200": "#2E2E2E",
  "--cool-grey-300": "#444444",
  "--cool-grey-400": "#8F8F8F",
  "--cool-grey-500": "#A0A0A0",
  "--cool-grey-600": "#B5B5B5",
  "--cool-grey-700": "#E6E6E6",
  "--cool-grey-800": "#ECECEC",
  "--cool-grey-900": "#F4F4F4",
  "--cool-grey-925": "#F7F7F7",
  "--cool-grey-950": "#FFFFFF",
  "--cool-grey-975": "#FBFBFB",
};

// Grayscale HSL channels ("0 0% L%") mirroring NEUTRAL_HSL's stop positions.
// prettier-ignore
const CODEX_DARK_HSL = {
  50:  "0 0% 98.04%", 100: "0 0% 92.94%", 200: "0 0% 83.92%", 300: "0 0% 70.59%",
  400: "0 0% 54.12%", 500: "0 0% 43.14%", 600: "0 0% 32.94%", 700: "0 0% 18.04%",
  800: "0 0% 14.12%", 850: "0 0% 10.98%", 900: "0 0% 9.41%",  950: "0 0% 5.49%",
  975: "0 0% 3.14%",
};
// prettier-ignore
const CODEX_LIGHT_HSL = {
  50:  "0 0% 5.1%",   100: "0 0% 9.02%",  200: "0 0% 18.04%", 300: "0 0% 26.67%",
  400: "0 0% 56.08%", 500: "0 0% 62.75%", 600: "0 0% 70.98%", 700: "0 0% 90.2%",
  800: "0 0% 92.55%", 850: "0 0% 94.12%", 900: "0 0% 95.69%", 950: "0 0% 100%",
  975: "0 0% 98.43%",
};

/** Build the HeroUI var map from a grayscale HSL stop table (NEUTRAL layout). */
function buildHeroui(hsl: Record<number, string>): Record<string, string> {
  return {
    "--heroui-background": hsl[950],
    "--heroui-background-foreground": hsl[50],
    "--heroui-foreground-50": hsl[975],
    "--heroui-foreground-100": hsl[950],
    "--heroui-foreground-200": hsl[900],
    "--heroui-foreground-300": hsl[850],
    "--heroui-foreground-400": hsl[800],
    "--heroui-foreground-500": hsl[700],
    "--heroui-foreground-600": hsl[600],
    "--heroui-foreground-700": hsl[500],
    "--heroui-foreground-800": hsl[400],
    "--heroui-foreground-900": hsl[300],
    "--heroui-foreground": hsl[300],
    "--heroui-content1": hsl[900],
    "--heroui-content1-foreground": hsl[100],
    "--heroui-content2": hsl[850],
    "--heroui-content2-foreground": hsl[200],
    "--heroui-content3": hsl[800],
    "--heroui-content3-foreground": hsl[300],
    "--heroui-content4": hsl[700],
    "--heroui-content4-foreground": hsl[400],
    "--heroui-default-50": hsl[975],
    "--heroui-default-100": hsl[950],
    "--heroui-default-200": hsl[900],
    "--heroui-default-300": hsl[850],
    "--heroui-default-400": hsl[800],
    "--heroui-default-500": hsl[700],
    "--heroui-default-600": hsl[600],
    "--heroui-default-700": hsl[500],
    "--heroui-default-800": hsl[400],
    "--heroui-default-900": hsl[300],
    "--heroui-default-foreground": hsl[50],
    "--heroui-default": hsl[800],
  };
}

// Literal --oh-* overrides (radius, shadows, focus, brand) that are not
// var(--cool-grey-*) references; applied via element.style on the scope root.
const CODEX_SHARED_TOKENS = {
  "--oh-radius": "14px",
  "--oh-field-radius": "16px",
};

const CODEX_DARK_TOKENS: Record<string, string> = {
  ...CODEX_SHARED_TOKENS,
  "--oh-surface-shadow": "0 1px 2px rgba(0, 0, 0, 0.4)",
  "--oh-overlay-shadow": "0 8px 30px rgba(0, 0, 0, 0.5)",
  "--oh-field-shadow": "0 1px 2px rgba(0, 0, 0, 0.35)",
  "--oh-focus": "#ededed",
  "--oh-color-primary": "#fafafa",
  "--oh-color-logo": "#fafafa",
  "--oh-accent": "#fafafa",
  "--oh-accent-foreground": "#0e0e0e",
  "--oh-warning": "#fafafa",
};

const CODEX_LIGHT_TOKENS: Record<string, string> = {
  ...CODEX_SHARED_TOKENS,
  "--oh-surface-shadow":
    "0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.06)",
  "--oh-overlay-shadow": "0 8px 30px rgba(0, 0, 0, 0.12)",
  "--oh-field-shadow":
    "0 1px 2px rgba(0, 0, 0, 0.05), 0 2px 8px rgba(0, 0, 0, 0.04)",
  "--oh-focus": "#0d0d0d",
  "--oh-color-primary": "#0d0d0d",
  "--oh-color-logo": "#0d0d0d",
  "--oh-accent": "#0d0d0d",
  "--oh-accent-foreground": "#ffffff",
  "--oh-warning": "#0d0d0d",
};

export const COLOR_THEMES: Record<ColorThemeKey, ColorThemeDefinition> = {
  codex: {
    label: "Codex",
    colorScheme: "dark",
    scale: CODEX_DARK_SCALE,
    heroui: buildHeroui(CODEX_DARK_HSL),
    tokens: CODEX_DARK_TOKENS,
    light: {
      colorScheme: "light",
      scale: CODEX_LIGHT_SCALE,
      heroui: buildHeroui(CODEX_LIGHT_HSL),
      tokens: CODEX_LIGHT_TOKENS,
    },
  },

  "openhands-deepsea": {
    label: "OpenHands-DeepSea",
    // Matches the values already set by index.css; included so switching back
    // from another theme restores the original palette explicitly.
    scale: {
      "--cool-grey-50": "#F7F9FC",
      "--cool-grey-100": "#EEF2F7",
      "--cool-grey-200": "#DCE3EE",
      "--cool-grey-300": "#C3CDDC",
      "--cool-grey-400": "#A3B0C4",
      "--cool-grey-500": "#7E8A9E",
      "--cool-grey-600": "#626D82",
      "--cool-grey-700": "#4B5468",
      "--cool-grey-800": "#383F50",
      "--cool-grey-900": "#2C313F",
      "--cool-grey-925": "#21252F",
      "--cool-grey-950": "#0B0E14",
      "--cool-grey-975": "#05070A",
    },
    // Values generated by heroui() from hero.ts — restore them explicitly when
    // switching back from another theme.
    heroui: {
      "--heroui-background": "220 29.03% 6.08%",
      "--heroui-background-foreground": "216 45.45% 97.84%",
      "--heroui-foreground-50": "216 33.33% 2.94%",
      "--heroui-foreground-100": "220 29.03% 6.08%",
      "--heroui-foreground-200": "222.86 17.5% 15.69%",
      "--heroui-foreground-300": "224.21 17.76% 20.98%",
      "--heroui-foreground-400": "222.5 17.65% 26.67%",
      "--heroui-foreground-500": "221.38 16.2% 35.1%",
      "--heroui-foreground-600": "219.38 14.04% 44.71%",
      "--heroui-foreground-700": "217.5 14.16% 55.69%",
      "--heroui-foreground-800": "216.36 21.85% 70.39%",
      "--heroui-foreground-900": "216 26.32% 81.37%",
      "--heroui-foreground": "216 26.32% 81.37%",
      "--heroui-content1": "222.86 17.5% 15.69%",
      "--heroui-content1-foreground": "213.33 36% 95.1%",
      "--heroui-content2": "224.21 17.76% 20.98%",
      "--heroui-content2-foreground": "216.67 34.62% 89.8%",
      "--heroui-content3": "222.5 17.65% 26.67%",
      "--heroui-content3-foreground": "216 26.32% 81.37%",
      "--heroui-content4": "221.38 16.2% 35.1%",
      "--heroui-content4-foreground": "216.36 21.85% 70.39%",
      "--heroui-default-50": "216 33.33% 2.94%",
      "--heroui-default-100": "220 29.03% 6.08%",
      "--heroui-default-200": "222.86 17.5% 15.69%",
      "--heroui-default-300": "224.21 17.76% 20.98%",
      "--heroui-default-400": "222.5 17.65% 26.67%",
      "--heroui-default-500": "221.38 16.2% 35.1%",
      "--heroui-default-600": "219.38 14.04% 44.71%",
      "--heroui-default-700": "217.5 14.16% 55.69%",
      "--heroui-default-800": "216.36 21.85% 70.39%",
      "--heroui-default-900": "216 26.32% 81.37%",
      "--heroui-default-foreground": "216 45.45% 97.84%",
      "--heroui-default": "222.5 17.65% 26.67%",
    },
  },

  "openhands-neutral": {
    label: "OpenHands-Neutral",
    scale: NEUTRAL_SCALE,
    // Each stop follows the same positional mapping as hero.ts:
    //   heroui-default-100 ← cool-grey-950 position ← neutral-950 (#181818)
    //   heroui-default-200 ← cool-grey-925 position ← neutral-900 (#202020)
    //   ...etc.
    heroui: NEUTRAL_HEROUI,
  },

  "openhands-neo": {
    label: "OpenHands-Neo",
    scale: NEUTRAL_SCALE,
    heroui: NEUTRAL_HEROUI,
    tokens: NEO_WHITE_BUTTON_TOKENS,
  },
};

export const DEFAULT_COLOR_THEME: ColorThemeKey = "codex";

export const AVAILABLE_COLOR_THEMES = Object.entries(COLOR_THEMES).map(
  ([key, def]) => ({ key: key as ColorThemeKey, label: def.label }),
);

const STORAGE_KEY = "openhands-color-theme";

/** Read the persisted theme key from localStorage, falling back to the default. */
export function readPersistedColorTheme(): ColorThemeKey {
  if (typeof window === "undefined") return DEFAULT_COLOR_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored in COLOR_THEMES) return stored as ColorThemeKey;
  } catch {
    // ignore quota / privacy-mode failures
  }
  return DEFAULT_COLOR_THEME;
}

/** Persist the theme key to localStorage. */
export function persistColorTheme(key: ColorThemeKey): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // ignore
  }
}

const THEME_STYLE_TAG_ID = "oh-color-theme-override";

/**
 * Apply a theme by injecting (or replacing) a <style> tag that overrides
 * both our custom --cool-grey-* primitives and HeroUI's --heroui-* tokens.
 *
 * Why a <style> tag:
 *   PostCSS transforms :root / body to [data-agent-server-ui], so --cool-grey-*
 *   is set on EVERY element carrying that attribute. A body inline-style only
 *   overrides body itself — inner matching elements keep the stylesheet value.
 *   Injecting a stylesheet appended to <head> wins on equal specificity because
 *   later sheets take precedence in the cascade.
 *
 * Why heroui variables:
 *   HeroUI stores colors as HSL channels in --heroui-* vars on [data-theme=dark].
 *   They reference their own token system and are unaffected by --cool-grey-*
 *   changes, so we override them from the same injected sheet.
 */
/** Resolve a theme's concrete variant for the given appearance. */
function resolveThemeVariant(
  key: ColorThemeKey,
  appearance: ResolvedAppearance,
): Required<Pick<ColorThemeVariant, "scale" | "heroui">> & {
  tokens: Record<string, string>;
  colorScheme: ResolvedAppearance;
} {
  const def = COLOR_THEMES[key];
  const variant = appearance === "light" && def.light ? def.light : def;
  return {
    scale: variant.scale,
    heroui: variant.heroui,
    tokens: variant.tokens ?? {},
    colorScheme: variant.colorScheme ?? "dark",
  };
}

export function applyColorTheme(
  key: ColorThemeKey,
  appearance: ResolvedAppearance = "dark",
): void {
  if (typeof document === "undefined") return;
  const { scale, heroui, tokens, colorScheme } = resolveThemeVariant(
    key,
    appearance,
  );

  const scaleDecls = Object.entries(scale)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  const herouiDecls = Object.entries(heroui)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  const tokenDecls = Object.entries(tokens)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  // Target both selectors for heroui vars:
  //   [data-agent-server-ui] — covers document.body (portal destination) so
  //     portalled popover/listbox content inherits the overridden values.
  //   [data-theme=dark]      — covers the inner AgentServerUIRoot wrapper so
  //     components scoped inside the dark theme wrapper also pick them up.
  const css = [
    `[data-agent-server-ui] {\n  color-scheme: ${colorScheme};\n${scaleDecls}\n${herouiDecls}\n${tokenDecls}\n}`,
    `[data-theme=dark] {\n${herouiDecls}\n}`,
  ].join("\n");

  let styleEl = document.getElementById(
    THEME_STYLE_TAG_ID,
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = THEME_STYLE_TAG_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;

  syncColorThemeTokensOnScopeRoots(tokens);
}

/** Apply the persisted color theme at the persisted (resolved) appearance. */
export function applyActiveTheme(): void {
  applyColorTheme(
    readPersistedColorTheme(),
    resolveAppearance(readPersistedAppearanceMode()),
  );
}

// Tokens applied on the previous theme so we can clear ones the next theme
// doesn't set (token sets differ in size between themes).
let lastAppliedTokenKeys: string[] = [];

function syncColorThemeTokensOnScopeRoots(
  tokens: Record<string, string>,
): void {
  const roots = document.querySelectorAll("[data-agent-server-ui]");
  const nextKeys = Object.keys(tokens);
  const keysToClear = lastAppliedTokenKeys.filter((k) => !(k in tokens));

  for (const root of roots) {
    if (!(root instanceof HTMLElement)) continue;

    for (const key of keysToClear) {
      root.style.removeProperty(key);
    }
    for (const [key, value] of Object.entries(tokens)) {
      root.style.setProperty(key, value);
    }
  }

  lastAppliedTokenKeys = nextKeys;
}
