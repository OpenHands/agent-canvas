import { describe, expect, it } from "vitest";
import {
  computeDropdownMenuLayout,
  getDropdownMenuAvailableHeightPx,
} from "#/ui/dropdown/dropdown-menu-layout";

describe("dropdown menu layout", () => {
  const anchorRect = {
    top: 400,
    bottom: 440,
    left: 0,
    right: 200,
    width: 200,
    height: 40,
    x: 0,
    y: 400,
    toJSON: () => ({}),
  } as DOMRect;

  it("uses space above the anchor when opening upward", () => {
    expect(
      getDropdownMenuAvailableHeightPx(anchorRect, true, 800, 16),
    ).toBe(384);
  });

  it("uses space below the anchor when opening downward", () => {
    expect(
      getDropdownMenuAvailableHeightPx(anchorRect, false, 800, 16),
    ).toBe(344);
  });

  it("does not scroll when content fits the available space", () => {
    expect(
      computeDropdownMenuLayout(anchorRect, 240, true, 800, 16),
    ).toEqual({
      needsScroll: false,
      maxHeightPx: undefined,
    });
  });

  it("caps height and enables scroll when content exceeds the viewport", () => {
    expect(
      computeDropdownMenuLayout(anchorRect, 500, true, 800, 16),
    ).toEqual({
      needsScroll: true,
      maxHeightPx: 384,
    });
  });
});
