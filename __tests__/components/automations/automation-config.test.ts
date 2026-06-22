import { describe, expect, it } from "vitest";
import {
  getAutomationConfig,
  getInitialConfigValues,
} from "#/components/features/automations/automation-config";

describe("automation-config", () => {
  it("exposes a config for the github PR reviewer", () => {
    const config = getAutomationConfig("github-pr-reviewer");
    expect(config).toBeDefined();
    expect(config?.fields.map((field) => field.key)).toEqual([
      "repository",
      "reviewStyle",
      "respondToLabel",
    ]);
  });

  it("returns undefined for automations without a config schema", () => {
    expect(getAutomationConfig("github-repo-monitor")).toBeUndefined();
    expect(getAutomationConfig("does-not-exist")).toBeUndefined();
  });

  it("seeds initial values from field defaults", () => {
    const config = getAutomationConfig("github-pr-reviewer")!;
    expect(getInitialConfigValues(config)).toEqual({
      repository: "",
      reviewStyle: "balanced",
      respondToLabel: "",
    });
  });

  describe("github PR reviewer prompt builder", () => {
    const config = getAutomationConfig("github-pr-reviewer")!;

    it("pins a scheduled trigger and a fixed 5-minute poll", () => {
      const prompt = config.buildPrompt({
        repository: "octocat/hello-world",
        reviewStyle: "balanced",
        respondToLabel: "",
      });
      expect(prompt).toContain("octocat/hello-world");
      expect(prompt).toContain("SCHEDULED");
      expect(prompt).toContain("NOT an event-driven one");
      expect(prompt).toContain("*/5 * * * *");
      expect(prompt).toContain("every 5 minutes");
    });

    it("instructs the agent not to spawn a conversation on every interval", () => {
      const prompt = config.buildPrompt({
        repository: "octocat/hello-world",
        reviewStyle: "balanced",
        respondToLabel: "",
      });
      expect(prompt).toContain("do NOT start a new agent conversation");
      expect(prompt.toLowerCase()).toContain("only create a conversation");
    });

    it("reviews every PR when no label is provided", () => {
      const prompt = config.buildPrompt({
        repository: "octocat/hello-world",
        reviewStyle: "balanced",
        respondToLabel: "",
      });
      expect(prompt).toContain("Review every newly opened or updated");
    });

    it("scopes to a label when one is provided", () => {
      const prompt = config.buildPrompt({
        repository: "octocat/hello-world",
        reviewStyle: "balanced",
        respondToLabel: "needs-review",
      });
      expect(prompt).toContain('"needs-review"');
      expect(prompt).toContain("Skip every pull request without that label");
    });

    it("switches tone for the roasted review style", () => {
      const balanced = config.buildPrompt({
        repository: "octocat/hello-world",
        reviewStyle: "balanced",
        respondToLabel: "",
      });
      const roasted = config.buildPrompt({
        repository: "octocat/hello-world",
        reviewStyle: "roasted",
        respondToLabel: "",
      });
      expect(balanced).toContain("balanced, constructive review tone");
      expect(roasted).toContain("friendly roast");
    });

    it("trims whitespace and falls back to balanced for an unknown style", () => {
      const prompt = config.buildPrompt({
        repository: "  octocat/hello-world  ",
        reviewStyle: "",
        respondToLabel: "  ",
      });
      expect(prompt).toContain('"octocat/hello-world"');
      expect(prompt).toContain("balanced, constructive review tone");
      expect(prompt).toContain("Review every newly opened or updated");
    });
  });
});
