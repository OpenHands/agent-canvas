export type AppearanceMode = "system" | "light" | "dark";

export type ResolvedAppearance = "light" | "dark";

export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "system";

export const AVAILABLE_APPEARANCE_MODES: {
  key: AppearanceMode;
  label: string;
}[] = [
  { key: "system", label: "System" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

const STORAGE_KEY = "openhands-appearance-mode";

const MODES = new Set<AppearanceMode>(["system", "light", "dark"]);

/** Read the persisted appearance mode, falling back to the default. */
export function readPersistedAppearanceMode(): AppearanceMode {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE_MODE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && MODES.has(stored as AppearanceMode)) {
      return stored as AppearanceMode;
    }
  } catch {
    // ignore quota / privacy-mode failures
  }
  return DEFAULT_APPEARANCE_MODE;
}

/** Persist the appearance mode to localStorage. */
export function persistAppearanceMode(mode: AppearanceMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia(DARK_QUERY).matches;
}

/** Resolve an appearance mode to a concrete light/dark value. */
export function resolveAppearance(mode: AppearanceMode): ResolvedAppearance {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return systemPrefersDark() ? "dark" : "light";
}

/**
 * Subscribe to OS color-scheme changes. The callback fires whenever the
 * system preference flips; callers should re-resolve and re-apply the theme
 * only when the active mode is "system". Returns an unsubscribe function.
 */
export function subscribeToSystemAppearance(
  onChange: (prefersDark: boolean) => void,
): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(DARK_QUERY);
  const handler = (event: MediaQueryListEvent) => onChange(event.matches);
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}
