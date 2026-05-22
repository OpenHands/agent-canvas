import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CirclePlusCheckToggle } from "#/components/shared/buttons/circle-plus-check-toggle";

describe("CirclePlusCheckToggle", () => {
  it("toggles between plus and checkmark states", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    const { rerender } = render(
      <CirclePlusCheckToggle
        testId="skill-toggle"
        isSelected={false}
        onToggle={onToggle}
      />,
    );

    const toggle = screen.getByTestId("skill-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAttribute(
      "aria-label",
      "SETTINGS$SKILLS_ENABLE_SKILL",
    );

    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(true);

    rerender(
      <CirclePlusCheckToggle
        testId="skill-toggle"
        isSelected
        onToggle={onToggle}
      />,
    );

    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveAttribute(
      "aria-label",
      "SETTINGS$SKILLS_DISABLE_SKILL",
    );

    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("stops click propagation for nested card handlers", async () => {
    const user = userEvent.setup();
    const onCardClick = vi.fn();
    const onToggle = vi.fn();

    render(
      <div role="button" tabIndex={0} onClick={onCardClick}>
        <CirclePlusCheckToggle
          testId="skill-toggle"
          isSelected={false}
          onToggle={onToggle}
        />
      </div>,
    );

    await user.click(screen.getByTestId("skill-toggle"));

    expect(onToggle).toHaveBeenCalledWith(true);
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
