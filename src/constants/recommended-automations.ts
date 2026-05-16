import {
  AUTOMATION_CATALOG,
  type RecommendedAutomation,
} from "@openhands/extensions/automations";

export type { RecommendedAutomation };

export const RECOMMENDED_AUTOMATIONS: RecommendedAutomation[] =
  AUTOMATION_CATALOG;

export function getRecommendedAutomationsByPopularity() {
  return [...RECOMMENDED_AUTOMATIONS].sort(
    (a, b) => b.popularityRank - a.popularityRank,
  );
}
