import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  getHoverMarqueeDurationMs,
  getHoverMarqueeMaskImage,
  getHoverMarqueeMaskInsets,
  getHoverMarqueeOffset,
  HOVER_MARQUEE_FADE_IN_DURATION_MS,
  HoverMarqueeLabel,
  readHoverMarqueeFadeState,
} from "#/ui/dropdown/hover-marquee-label";

describe("hover marquee helpers", () => {
  it("computes scroll offset from container and content widths", () => {
    expect(getHoverMarqueeOffset(100, 160)).toBe(60);
    expect(getHoverMarqueeOffset(160, 100)).toBe(0);
  });

  it("clamps marquee duration between min and max", () => {
    expect(getHoverMarqueeDurationMs(10)).toBe(1200);
    expect(getHoverMarqueeDurationMs(200)).toBe(4000);
    expect(getHoverMarqueeDurationMs(80)).toBe(2000);
  });

  it("derives edge fade visibility from overflow and hover state", () => {
    expect(
      readHoverMarqueeFadeState({ isOverflowing: false, isHovered: false }),
    ).toEqual({ left: false, right: false });
    expect(
      readHoverMarqueeFadeState({ isOverflowing: true, isHovered: false }),
    ).toEqual({ left: false, right: true });
    expect(
      readHoverMarqueeFadeState({ isOverflowing: true, isHovered: true }),
    ).toEqual({ left: true, right: true });
  });

  it("maps mask modes to inset pairs for animated transparent fades", () => {
    expect(getHoverMarqueeMaskInsets("right")).toEqual({
      left: "0px",
      right: "2.5rem",
    });
    expect(getHoverMarqueeMaskInsets("left")).toEqual({
      left: "2.5rem",
      right: "0px",
    });
    expect(getHoverMarqueeMaskImage("both")).toContain("transparent 0");
    expect(getHoverMarqueeMaskImage("both")).toContain("transparent 100%");
  });
});

describe("HoverMarqueeLabel", () => {
  it("marks non-overflowing labels", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(120);

    render(
      <span className="group flex w-48">
        <HoverMarqueeLabel>Short label</HoverMarqueeLabel>
      </span>,
    );

    expect(screen.getByTestId("hover-marquee-label")).toHaveAttribute(
      "data-overflow",
      "false",
    );
    expect(screen.getByTestId("hover-marquee-label-clip")).not.toHaveClass(
      "hover-marquee-clip",
    );
  });

  it("applies animated clip mask timing vars when overflowing", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(200);

    render(
      <span className="group flex w-20">
        <HoverMarqueeLabel>
          Very long backend name that should scroll on hover
        </HoverMarqueeLabel>
      </span>,
    );

    const label = screen.getByTestId("hover-marquee-label");
    await waitFor(() => {
      expect(label).toHaveAttribute("data-overflow", "true");
    });

    const clip = screen.getByTestId("hover-marquee-label-clip");
    expect(clip).toHaveClass("hover-marquee-clip");
    expect(clip).toHaveStyle({
      "--hover-marquee-mask-duration": "3000ms",
      "--hover-marquee-mask-fade-in-duration": `${HOVER_MARQUEE_FADE_IN_DURATION_MS}ms`,
    });

    const inner = screen.getByTestId("hover-marquee-label-content");
    expect(inner).toHaveStyle({
      "--hover-marquee-offset": "-120px",
      transitionDuration: "3000ms",
    });
    expect(inner.className).toContain("group-hover:");
  });
});
