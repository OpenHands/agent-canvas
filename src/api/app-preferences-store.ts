import { Settings } from "#/types/settings";

/**
 * The local agent-server's PATCH /api/settings only persists
 * `agent_settings_diff` and `conversation_settings_diff`. App-level user
 * preferences (language, sound notifications, analytics consent, git
 * identity) have no native home in that schema, so we persist them in
 * localStorage as a workaround. This is the same fallback pattern used
 * by `DISABLED_SKILLS_STORAGE_KEY` in `settings-service.api.ts`.
 *
 * In cloud mode the cloud backend accepts these fields as flat top-level
 * keys at POST /api/v1/settings, and the cloud fetch returns them. We
 * still write through to localStorage so the values survive momentary
 * fetch failures and so the merge logic in `syncDerivedSettings` has a
 * single source for both modes.
 *
 * Long-term goal: extend the local agent-server settings schema to cover
 * these fields and delete this module entirely.
 */
export const APP_PREFERENCES_STORAGE_KEY =
  "openhands-agent-server-app-preferences";

export const APP_PREFERENCE_FIELDS = [
  "language",
  "user_consents_to_analytics",
  "enable_sound_notifications",
  "git_user_name",
  "git_user_email",
] as const;

export type AppPreferenceField = (typeof APP_PREFERENCE_FIELDS)[number];

export type StoredAppPreferences = Partial<Pick<Settings, AppPreferenceField>>;

const APP_PREFERENCE_FIELD_SET: ReadonlySet<string> = new Set(
  APP_PREFERENCE_FIELDS,
);

const isAppPreferenceField = (key: string): key is AppPreferenceField =>
  APP_PREFERENCE_FIELD_SET.has(key);

const coerceValue = (
  key: AppPreferenceField,
  value: unknown,
): StoredAppPreferences[AppPreferenceField] | undefined => {
  switch (key) {
    case "language":
    case "git_user_name":
    case "git_user_email":
      return typeof value === "string" ? value : undefined;
    case "enable_sound_notifications":
      return typeof value === "boolean" ? value : undefined;
    case "user_consents_to_analytics":
      if (value === null) return null;
      return typeof value === "boolean" ? value : undefined;
    default:
      return undefined;
  }
};

const sanitize = (input: Record<string, unknown>): StoredAppPreferences => {
  const out: StoredAppPreferences = {};
  for (const key of APP_PREFERENCE_FIELDS) {
    if (key in input) {
      const coerced = coerceValue(key, input[key]);
      if (coerced !== undefined) {
        // TS can't narrow per-key writes through a discriminated assignment,
        // so funnel through a single record write.
        (out as Record<string, unknown>)[key] = coerced;
      }
    }
  }
  return out;
};

export const readStoredAppPreferences = (): StoredAppPreferences => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return sanitize(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
};

export const writeStoredAppPreferences = (
  partial: StoredAppPreferences,
): void => {
  if (typeof window === "undefined") return;

  const sanitized = sanitize(partial as Record<string, unknown>);
  const existing = readStoredAppPreferences();
  const merged: StoredAppPreferences = { ...existing, ...sanitized };

  if (Object.keys(merged).length === 0) {
    window.localStorage.removeItem(APP_PREFERENCES_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    APP_PREFERENCES_STORAGE_KEY,
    JSON.stringify(merged),
  );
};

export const clearStoredAppPreferences = (): void => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(APP_PREFERENCES_STORAGE_KEY);
};

/**
 * Split known app-preference keys out of a save payload. Used by
 * `SettingsService.saveSettings` so the local PATCH only ever sees the
 * diff fields the agent-server accepts.
 */
export const extractAppPreferences = (
  input: Record<string, unknown>,
): { extracted: StoredAppPreferences; rest: Record<string, unknown> } => {
  const extracted: StoredAppPreferences = {};
  const rest: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (isAppPreferenceField(key)) {
      const coerced = coerceValue(key, value);
      if (coerced !== undefined) {
        (extracted as Record<string, unknown>)[key] = coerced;
      }
    } else {
      rest[key] = value;
    }
  }

  return { extracted, rest };
};
