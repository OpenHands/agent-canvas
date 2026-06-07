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
import { execSync } from "child_process";
import { homedir } from "os";

// ── Paths ────────────────────────────────────────────────────────────

/** STATE_DIR matches playwright.mock-llm.config.ts */
export const STATE_DIR = resolve(".tmp/mock-llm-state");

/**
 * Root directory for skill-test workspace git repos.
 * Each call to `createProjectSkillRepo` creates a self-contained git repo
 * here with the skill file already committed, so the agent-server's
 * worktree machinery picks it up (worktrees only contain committed content).
 */
export const SKILL_REPOS_DIR = resolve(".tmp/mock-llm-skill-repos");

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

/**
 * Create a standalone git repo with a project skill committed.
 *
 * The agent-server creates a git worktree for each conversation from the
 * source workspace. Only committed files appear in worktrees, so the skill
 * must be committed to the repo for `load_project_skills` to find it.
 *
 * @returns Absolute path to the git repo root (use as `working_dir`).
 */
export function createProjectSkillRepo(
  name: string,
  trigger: string,
  description = "E2E test skill",
): string {
  const repoDir = join(SKILL_REPOS_DIR, `${name}-repo`);
  // Start fresh each time
  rmSync(repoDir, { recursive: true, force: true });
  mkdirSync(repoDir, { recursive: true });

  // Write the skill file
  const skillDir = join(repoDir, ".agents", "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    makeSkillMd(name, trigger, description),
  );

  // Initialize as a git repo and commit
  const opts = { cwd: repoDir, stdio: "pipe" as const };
  execSync("git init", opts);
  execSync('git config user.email "test@test.com"', opts);
  execSync('git config user.name "Test"', opts);
  execSync("git add -A", opts);
  execSync('git commit -m "Add project skill"', opts);

  return resolve(repoDir);
}

/** Remove a project skill repo created by `createProjectSkillRepo`. */
export function removeProjectSkillRepo(name: string): void {
  const repoDir = join(SKILL_REPOS_DIR, `${name}-repo`);
  rmSync(repoDir, { recursive: true, force: true });
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

export function removeUserSkill(name: string): void {
  const dir = join(USER_SKILLS_DIR, name);
  rmSync(dir, { recursive: true, force: true });
}

export function userSkillExists(name: string): boolean {
  return existsSync(join(USER_SKILLS_DIR, name, "SKILL.md"));
}

export function userSkillDirExists(name: string): boolean {
  return existsSync(join(USER_SKILLS_DIR, name));
}
