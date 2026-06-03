import { describe, expect, it } from "vitest";
import { AVAILABLE_COLOR_THEMES, COLOR_THEMES } from "#/themes/color-themes";

describe("color themes", () => {
  it("exposes only the distinct Neutral and DeepSea themes", () => {
    expect(AVAILABLE_COLOR_THEMES.map((theme) => theme.key)).toEqual([
      "openhands-deepsea",
      "openhands-neutral",
    ]);
  });

  it("keeps DeepSea visually distinct from Neutral", () => {
    const deepsea = COLOR_THEMES["openhands-deepsea"];
    const neutral = COLOR_THEMES["openhands-neutral"];

    expect(deepsea.scale).not.toEqual(neutral.scale);
    expect(deepsea.heroui).not.toEqual(neutral.heroui);
  });
});
