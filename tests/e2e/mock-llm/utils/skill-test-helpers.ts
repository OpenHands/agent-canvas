/**
 * Helpers for skill loading E2E tests.
 *
 * File-system operations (create/remove SKILL.md files) and API
 * assertions (verify activated_skills on events) are separated here
 * to avoid type-resolution conflicts between node built-in imports
 * and @playwright/test types in the same file (TypeScript 6 / Node 24).
 */

import { resolve, join } from "path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { homedir } from "os";

// ── Paths ────────────────────────────────────────────────────────────

/** STATE_DIR matches playwright.mock-llm.config.ts */
export const STATE_DIR = resolve(".tmp/mock-llm-state");

/**
 * Default workspace path. The frontend sends `working_dir: "workspace/project"`
 * and the agent-server resolves it relative to its CWD (`${STATE_DIR}/workspaces`).
 */
export const WORKSPACE_DIR = join(STATE_DIR, "workspaces", "workspace", "project");

/** User-level skills directory (SDK searches `~/.openhands/skills/`). */
export const USER_SKILLS_DIR = join(homedir(), ".openhands", "skills");

// ── Skill content builders ───────────────────────────────────────────

function makeSkillMd(
  name: string,
  trigger: string,
  description: string,
): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "triggers:",
    `- ${trigger}`,
    "---",
    "",
    `This is the ${name} skill content for E2E testing.`,
    `It should activate when the keyword "${trigger}" appears.`,
  ].join("\n");
}

export function writeSkill(
  baseDir: string,
  name: string,
  trigger: string,
  description = "E2E test skill",
): void {
  const dir = join(baseDir, ".agents", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), makeSkillMd(name, trigger, description));
}

export function writeUserSkill(
  name: string,
  trigger: string,
  description = "E2E test user skill",
): void {
  const dir = join(USER_SKILLS_DIR, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), makeSkillMd(name, trigger, description));
}

export function removeSkill(baseDir: string, name: string): void {
  const dir = join(baseDir, ".agents", "skills", name);
  rmSync(dir, { recursive: true, force: true });
}

export function removeUserSkill(name: string): void {
  const dir = join(USER_SKILLS_DIR, name);
  rmSync(dir, { recursive: true, force: true });
}

export function skillExists(baseDir: string, name: string): boolean {
  return existsSync(join(baseDir, ".agents", "skills", name, "SKILL.md"));
}

export function userSkillExists(name: string): boolean {
  return existsSync(join(USER_SKILLS_DIR, name, "SKILL.md"));
}

export function userSkillDirExists(name: string): boolean {
  return existsSync(join(USER_SKILLS_DIR, name));
}
