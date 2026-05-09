import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutomationsButton } from "#/components/shared/buttons/automations-button";
import {
  NavigationProvider,
  type NavigationContextValue,
} from "#/context/navigation-context";

vi.mock("#/components/shared/buttons/styled-tooltip", () => ({
  StyledTooltip: ({ children }: { children: unknown }) => children,
}));

function renderAutomationsButton(
  props: { disabled?: boolean } = {},
  overrides: Partial<NavigationContextValue> = {},
) {
  const value: NavigationContextValue = {
    currentPath: "/",
    conversationId: null,
    isNavigating: false,
    navigate: vi.fn(),
    ...overrides,
  };

  const result = render(
    <NavigationProvider value={value}>
      <AutomationsButton {...props} />
    </NavigationProvider>,
  );

  return { ...result, navigate: value.navigate };
}

describe("AutomationsButton", () => {
  it("should render a link to /automations", () => {
    renderAutomationsButton();

    const link = screen.getByTestId("automations-button");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/automations");
  });

  it("should be focusable and accessible when enabled", () => {
    renderAutomationsButton();

    const link = screen.getByTestId("automations-button");
    expect(link).toHaveAttribute("tabIndex", "0");
    expect(link).toHaveAttribute("aria-label", "SIDEBAR$AUTOMATIONS");
  });

  it("should navigate via SPA routing without a full page reload when clicked", () => {
    const { navigate } = renderAutomationsButton();

    const link = screen.getByTestId("automations-button");
    const clickEvent = createEvent.click(link);
    fireEvent(link, clickEvent);

    expect(navigate).toHaveBeenCalledWith("/automations", { replace: false });
    expect(clickEvent.defaultPrevented).toBe(true);
  });

  it("should prevent navigation and remove from tab order when disabled", () => {
    const { navigate } = renderAutomationsButton({ disabled: true });

    const link = screen.getByTestId("automations-button");
    expect(link).toHaveAttribute("tabIndex", "-1");

    const clickEvent = createEvent.click(link);
    fireEvent(link, clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
