import type { RecommendedAutomation } from "@openhands/extensions/automations";

/**
 * Integration ids whose automations behave like always-on "responders":
 * they listen for GitHub / Slack events (or poll for them) and react. These
 * are the cases where local polling has a meaningful limitation — it only
 * runs while the user's laptop is awake — so the user should be offered the
 * OpenHands Cloud runtime as an alternative before they configure the
 * automation. See issue #868.
 */
export const RESPONDER_INTEGRATION_IDS = ["github", "slack"] as const;

/**
 * A "responder" automation is one whose required integrations include GitHub
 * or Slack. We key off `requiredIntegrationIds` rather than the catalog `id`
 * so new GitHub/Slack templates are covered automatically without touching
 * this list.
 */
export function isResponderAutomation(
  automation: Pick<RecommendedAutomation, "requiredIntegrationIds">,
): boolean {
  return automation.requiredIntegrationIds.some((id) =>
    (RESPONDER_INTEGRATION_IDS as readonly string[]).includes(id),
  );
}
