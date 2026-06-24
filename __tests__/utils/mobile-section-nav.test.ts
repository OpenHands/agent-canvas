import { describe, expect, it } from "vitest";
import { getMobileTopBarState } from "#/utils/mobile-section-nav";
import { I18nKey } from "#/i18n/declaration";

describe("getMobileTopBarState", () => {
  it("shows the menu on the agents hub landing", () => {
    expect(getMobileTopBarState("/agents")).toEqual({ mode: "menu" });
  });

  it("backs from agents hub sub-pages to the hub", () => {
    expect(getMobileTopBarState("/agents/profiles")).toEqual({
      mode: "back",
      backTo: "/agents",
      backLabelKey: I18nKey.NAV$AGENTS,
    });
    expect(getMobileTopBarState("/agents/llm")).toEqual({
      mode: "back",
      backTo: "/agents",
      backLabelKey: I18nKey.NAV$AGENTS,
    });
  });

  it("shows menu on main app routes", () => {
    expect(getMobileTopBarState("/conversations")).toEqual({ mode: "menu" });
  });
});
