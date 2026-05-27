import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentServerUIRoot } from "#/components/providers/agent-server-ui-root";
import {
  AVAILABLE_COLOR_THEMES,
  COLOR_THEMES,
  applyColorTheme,
} from "#/themes/color-themes";

describe("color themes", () => {
  it("includes OpenHands-Neo as a neutral-based theme with white button tokens", () => {
    const neo = COLOR_THEMES["openhands-neo"];

    expect(neo.label).toBe("OpenHands-Neo");
    expect(neo.scale).toEqual(COLOR_THEMES["openhands-neutral"].scale);
    expect(neo.heroui).toEqual(COLOR_THEMES["openhands-neutral"].heroui);
    expect(neo.tokens?.["--oh-color-primary"]).toBe("#ffffff");
    expect(neo.tokens?.["--oh-accent"]).toBe("#ffffff");
  });

  it("exposes Neo in the settings theme picker", () => {
    expect(AVAILABLE_COLOR_THEMES.map((theme) => theme.key)).toContain(
      "openhands-neo",
    );
    expect(
      AVAILABLE_COLOR_THEMES.find((theme) => theme.key === "openhands-neo")
        ?.label,
    ).toBe("OpenHands-Neo");
  });

  it("injects white primary tokens when applying OpenHands-Neo", () => {
    document.body.setAttribute("data-agent-server-ui", "");

    applyColorTheme("openhands-neo");

    const styleEl = document.getElementById("oh-color-theme-override");
    expect(styleEl?.textContent).toContain("--oh-color-primary: #ffffff;");
    expect(styleEl?.textContent).toContain("--oh-accent: #ffffff;");

    styleEl?.remove();
    document.body.removeAttribute("data-agent-server-ui");
    document.body.style.removeProperty("--oh-color-primary");
    document.body.style.removeProperty("--oh-accent");
    document.body.style.removeProperty("--oh-warning");
  });

  it("applies Neo button tokens on the scoped UI root used by primary buttons", () => {
    render(
      <AgentServerUIRoot>
        <button type="button" data-testid="primary-button">
          Save
        </button>
      </AgentServerUIRoot>,
    );

    applyColorTheme("openhands-neo");

    const scopeRoot = screen.getByTestId("primary-button").closest(
      "[data-agent-server-ui]",
    ) as HTMLElement;

    expect(scopeRoot.style.getPropertyValue("--oh-color-primary")).toBe(
      "#ffffff",
    );

    applyColorTheme("openhands-neutral");

    expect(scopeRoot.style.getPropertyValue("--oh-color-primary")).toBe("");
  });
});
