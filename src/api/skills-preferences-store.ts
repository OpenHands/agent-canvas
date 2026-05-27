import { DEFAULT_SETTINGS } from "#/services/settings";
import type { Settings } from "#/types/settings";

export const SKILLS_PREFERENCES_STORAGE_KEY =
  "openhands-agent-server-skills-preferences";

type StoredSkillsPreferences = Pick<Settings, "disabled_skills">;

const sanitizeDisabledSkills = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) {
      out.push(item);
    }
  }
  return out;
};

export const readStoredSkillsPreferences = (): StoredSkillsPreferences => {
  if (typeof window === "undefined") {
    return { disabled_skills: DEFAULT_SETTINGS.disabled_skills };
  }

  try {
    const raw = window.localStorage.getItem(SKILLS_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return { disabled_skills: DEFAULT_SETTINGS.disabled_skills };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { disabled_skills: DEFAULT_SETTINGS.disabled_skills };
    }

    const disabled = sanitizeDisabledSkills(
      (parsed as Record<string, unknown>).disabled_skills,
    );
    return {
      disabled_skills: disabled ?? DEFAULT_SETTINGS.disabled_skills,
    };
  } catch {
    return { disabled_skills: DEFAULT_SETTINGS.disabled_skills };
  }
};

export const writeStoredSkillsPreferences = (
  partial: Partial<StoredSkillsPreferences>,
): void => {
  if (typeof window === "undefined") return;

  const disabled = sanitizeDisabledSkills(partial.disabled_skills);
  if (!disabled) return;

  const merged: StoredSkillsPreferences = {
    ...readStoredSkillsPreferences(),
    disabled_skills: disabled,
  };

  window.localStorage.setItem(
    SKILLS_PREFERENCES_STORAGE_KEY,
    JSON.stringify(merged),
  );
};

