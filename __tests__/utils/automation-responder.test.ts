import { describe, expect, it } from "vitest";
import { AUTOMATION_CATALOG } from "@openhands/extensions/automations";
import {
  isResponderAutomation,
  RESPONDER_INTEGRATION_IDS,
} from "#/utils/automation-responder";

function byId(id: string) {
  const automation = AUTOMATION_CATALOG.find((item) => item.id === id);
  if (!automation) throw new Error(`missing catalog automation: ${id}`);
  return automation;
}

describe("isResponderAutomation", () => {
  it("treats GitHub automations as responders", () => {
    expect(isResponderAutomation(byId("github-pr-reviewer"))).toBe(true);
    expect(isResponderAutomation(byId("github-repo-monitor"))).toBe(true);
  });

  it("treats Slack automations as responders", () => {
    expect(isResponderAutomation(byId("slack-channel-monitor"))).toBe(true);
    expect(isResponderAutomation(byId("slack-standup-digest"))).toBe(true);
  });

  it("treats automations without GitHub/Slack as non-responders", () => {
    expect(
      isResponderAutomation({ requiredIntegrationIds: ["tavily", "notion"] }),
    ).toBe(false);
    expect(isResponderAutomation({ requiredIntegrationIds: ["linear"] })).toBe(
      false,
    );
    expect(isResponderAutomation({ requiredIntegrationIds: [] })).toBe(false);
  });

  it("flags an automation that requires Slack alongside other integrations", () => {
    expect(
      isResponderAutomation({
        requiredIntegrationIds: ["slack", "linear", "notion"],
      }),
    ).toBe(true);
  });

  it("exposes the github/slack responder integration ids", () => {
    expect(RESPONDER_INTEGRATION_IDS).toEqual(["github", "slack"]);
  });
});
