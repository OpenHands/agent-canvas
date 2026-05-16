import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsNavigation } from "#/components/features/settings/settings-navigation";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";
import { SettingsNavRenderedItem } from "#/hooks/use-settings-nav-items";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

const baseItems: SettingsNavRenderedItem[] = [
  { type: "header", text: "SETTINGS$TITLE" as never },
  { type: "item", item: OSS_NAV_ITEMS[0] },
  { type: "divider" },
  { type: "item", item: OSS_NAV_ITEMS[1] },
];

function renderSettingsNavigation(ui: ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ActiveBackendProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

describe("SettingsNavigation", () => {
  it("renders the provided OSS navigation items, headers, and dividers", () => {
    renderSettingsNavigation(
      <SettingsNavigation
        isMobileMenuOpen={false}
        onCloseMobileMenu={vi.fn()}
        navigationItems={baseItems}
      />,
    );

    expect(screen.getByTestId("settings-navbar")).toBeInTheDocument();
    expect(screen.getAllByText("SETTINGS$TITLE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SETTINGS$NAV_LLM").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("SETTINGS$NAV_CONDENSER").length,
    ).toBeGreaterThan(0);
  });

  it("closes the mobile drawer when the close button is clicked", async () => {
    const onCloseMobileMenu = vi.fn();
    renderSettingsNavigation(
      <SettingsNavigation
        isMobileMenuOpen
        onCloseMobileMenu={onCloseMobileMenu}
        navigationItems={baseItems}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /close navigation menu/i }),
    );

    expect(onCloseMobileMenu).toHaveBeenCalledTimes(1);
  });

  it("closes the mobile drawer after a navigation item is selected", async () => {
    const onCloseMobileMenu = vi.fn();
    renderSettingsNavigation(
      <SettingsNavigation
        isMobileMenuOpen
        onCloseMobileMenu={onCloseMobileMenu}
        navigationItems={baseItems}
      />,
    );

    const mobileNav = screen.getByTestId("settings-navbar");
    await userEvent.click(within(mobileNav).getByText("SETTINGS$NAV_LLM"));

    expect(onCloseMobileMenu).toHaveBeenCalledTimes(1);
  });
});
