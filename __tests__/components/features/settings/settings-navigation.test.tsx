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

const llmItem = OSS_NAV_ITEMS.find((item) => item.to === "/settings")!;
const condenserItem = OSS_NAV_ITEMS.find(
  (item) => item.to === "/settings/condenser",
)!;

const baseItems: SettingsNavRenderedItem[] = [
  { type: "header", text: "SETTINGS$TITLE" as never },
  { type: "item", item: llmItem },
  { type: "divider" },
  { type: "item", item: condenserItem },
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

  it("renders disabled-by-ACP items as disabled in the desktop sidebar", () => {
    // Regression guard: when ACP is active, the LLM and Condenser items
    // come through with ``disabled: true`` from ``useSettingsNavItems``;
    // both the mobile drawer (via SettingsNavLink) and the desktop
    // sidebar (via SidebarNavLink) must propagate that. Earlier the
    // desktop branch dropped it and the items stayed clickable.
    renderSettingsNavigation(
      <SettingsNavigation
        isMobileMenuOpen={false}
        onCloseMobileMenu={vi.fn()}
        navigationItems={[
          {
            type: "item",
            item: llmItem,
            disabled: true,
            disabledAgentName: "Claude Code",
          },
          {
            type: "item",
            item: condenserItem,
            disabled: true,
            disabledAgentName: "Claude Code",
          },
        ]}
      />,
    );

    const desktopNav = screen.getByTestId("settings-navbar-desktop");

    // SidebarNavLink renders disabled items as a non-link span with
    // ``aria-disabled="true"`` and ``opacity-50`` styling.
    const llmLink = within(desktopNav).getByTestId(
      "sidebar-settings-/settings",
    );
    const condenserLink = within(desktopNav).getByTestId(
      "sidebar-settings-/settings/condenser",
    );
    expect(llmLink).toHaveAttribute("aria-disabled", "true");
    expect(condenserLink).toHaveAttribute("aria-disabled", "true");
  });

  it("leaves enabled items clickable in the desktop sidebar", () => {
    renderSettingsNavigation(
      <SettingsNavigation
        isMobileMenuOpen={false}
        onCloseMobileMenu={vi.fn()}
        navigationItems={[{ type: "item", item: llmItem }]}
      />,
    );
    const desktopNav = screen.getByTestId("settings-navbar-desktop");
    const llmLink = within(desktopNav).getByTestId(
      "sidebar-settings-/settings",
    );
    expect(llmLink).not.toHaveAttribute("aria-disabled", "true");
  });
});
