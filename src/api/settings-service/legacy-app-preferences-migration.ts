/**
 * One-shot migration: promote app preferences and disabled_skills from
 * pre-1.27 agent-canvas's localStorage into the agent-server's persisted
 * `misc_settings.app_preferences` block (introduced via SDK PRs #3539 +
 * follow-up refactor).
 *
 * Older versions stored these fields under two localStorage keys because
 * the local agent-server had no native home for them:
 *
 * - `openhands-agent-server-app-preferences` — { language?, git_user_name?,
 *   git_user_email?, enable_sound_notifications?, user_consents_to_analytics? }
 * - `openhands-agent-server-disabled-skills` — string[]
 *
 * Once the server reports a `misc_settings` block (even one with empty
 * defaults), we check those legacy keys, push any non-empty values up to
 * the server via a single PATCH, and clear the keys. The check is
 * idempotent: on subsequent calls both keys are absent and the function
 * no-ops.
 *
 * Failures during the PATCH are tolerated — the legacy keys are left in
 * place so a later attempt can retry. This keeps the migration a best-effort
 * side-effect of `getSettings`; if it never succeeds, the user just sees
 * empty server-side preferences (the same as a fresh install).
 */

import type { SettingsValue } from "#/types/settings";
import type {
  AppPreferences,
  SettingsApiResponse,
} from "./settings-service.api";

const LEGACY_APP_PREFERENCES_KEY = "openhands-agent-server-app-preferences";
const LEGACY_DISABLED_SKILLS_KEY = "openhands-agent-server-disabled-skills";

const isBrowser = (): boolean => typeof window !== "undefined";

const readLegacyAppPreferences = (): AppPreferences | null => {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_APP_PREFERENCES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as AppPreferences;
  } catch {
    return null;
  }
};

const readLegacyDisabledSkills = (): string[] | null => {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_DISABLED_SKILLS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return null;
  }
};

const clearLegacyKeys = (): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(LEGACY_APP_PREFERENCES_KEY);
    window.localStorage.removeItem(LEGACY_DISABLED_SKILLS_KEY);
  } catch {
    // ignore; the migration will be retried on next read
  }
};

const APP_PREFERENCE_KEYS = [
  "language",
  "user_consents_to_analytics",
  "enable_sound_notifications",
  "git_user_name",
  "git_user_email",
] as const;

const buildDiff = (
  storedPrefs: AppPreferences | null,
  storedSkills: string[] | null,
): AppPreferences | null => {
  const diff: Record<string, unknown> = {};
  if (storedPrefs) {
    for (const key of APP_PREFERENCE_KEYS) {
      const value = (storedPrefs as Record<string, unknown>)[key];
      if (value !== undefined) {
        diff[key] = value;
      }
    }
  }
  if (storedSkills) {
    diff.disabled_skills = storedSkills;
  }
  return Object.keys(diff).length > 0
    ? (diff as Record<string, SettingsValue> as AppPreferences)
    : null;
};

/**
 * Returns `true` when a migration PATCH was issued (caller should re-fetch
 * settings). Returns `false` when no legacy data was present.
 */
export const migrateLegacyAppPreferences = async (
  serverResponse: SettingsApiResponse,
  pushDiff: (diff: AppPreferences) => Promise<unknown>,
): Promise<boolean> => {
  // Only run when the server actually returns a `misc_settings` block
  // (server is new enough to accept the diff). Older servers omit the
  // field entirely; the migration stays pending until the user upgrades.
  if (!serverResponse.misc_settings) return false;

  const storedPrefs = readLegacyAppPreferences();
  const storedSkills = readLegacyDisabledSkills();
  const diff = buildDiff(storedPrefs, storedSkills);
  if (!diff) return false;

  try {
    await pushDiff(diff);
    clearLegacyKeys();
    return true;
  } catch {
    // Leave the legacy keys for a later retry; we don't want to lose data on
    // a transient network failure.
    return false;
  }
};

export const __TEST_ONLY = {
  LEGACY_APP_PREFERENCES_KEY,
  LEGACY_DISABLED_SKILLS_KEY,
};
