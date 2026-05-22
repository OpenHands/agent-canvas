import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AutomationViewToggle } from "#/components/features/automations/automation-view-toggle";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("AutomationViewToggle", () => {
  it("opens a menu from the icon trigger and switches to list view", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<AutomationViewToggle view="grid" onChange={onChange} />);

    const trigger = screen.getByTestId("automations-view-toggle");
    expect(trigger).toHaveClass("size-9");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    await user.click(trigger);
    await user.click(screen.getByTestId("automations-view-toggle-list"));

    expect(onChange).toHaveBeenCalledWith("list");
  });
});
