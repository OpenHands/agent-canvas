import { describe, expect, it } from "vitest";
import { HOVER_MARQUEE_CROSSFADE_MS } from "#/ui/dropdown/hover-marquee-phase";

describe("hover marquee phase helpers", () => {
  it("exports the crossfade duration constant", () => {
    expect(HOVER_MARQUEE_CROSSFADE_MS).toBe(150);
  });
});
