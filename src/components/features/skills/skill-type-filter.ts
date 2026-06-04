import type { SkillScope } from "#/utils/skill-scope";

// --- Scope filter (replaces the old type filter) ---

export type SkillScopeFilter = "all" | SkillScope;

export const SKILL_SCOPE_FILTER_OPTIONS: readonly SkillScopeFilter[] = [
  "all",
  "public",
  "personal",
  "project",
] as const;

// --- Status filter (enabled / disabled) ---

export type SkillStatusFilter = "all" | "enabled" | "disabled";

export const SKILL_STATUS_FILTER_OPTIONS: readonly SkillStatusFilter[] = [
  "all",
  "enabled",
  "disabled",
] as const;
