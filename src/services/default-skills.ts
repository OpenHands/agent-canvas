/**
 * System-curated default skills.
 *
 * This mirrors public/default-skills-marketplace.json and is used client-side
 * to show the DEFAULT badge on skill cards. Users cannot edit this list; they
 * control which skills are active via the disabled_skills toggle instead.
 */
export const DEFAULT_SKILL_NAMES: readonly string[] = [
  "github",
  "code-review",
  "docker",
  "openhands-automation",
];

export const DEFAULT_MARKETPLACE_PATH = "/default-skills-marketplace.json";
