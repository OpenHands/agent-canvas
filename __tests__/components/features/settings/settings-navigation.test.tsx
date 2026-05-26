import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsNavigation } from "#/components/features/settings/settings-navigation";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";
import { SettingsNavRenderedItem } from "#/hooks/use-settings-nav-items";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

// HeroUI's Tooltip (the engine behind ``StyledTooltip``) only mounts
// its content when the trigger is interacted with via real-DOM events.
// jsdom + userEvent.hover doesn't reliably fire that, so we stub the
// wrapper to render its content eagerly — every test below can then
// assert "the tooltip would say X" by looking for X in the DOM.
vi.mock("#/components/shared/buttons/styled-tooltip", () => ({
  StyledTooltip: ({
    content,
    children,
  }: {
    content: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <>
      {children}
      <span data-testid="styled-tooltip-content">{content}</span>
    </>
  ),
}));

const llmItem = OSS_NAV_ITEMS.find((item) => item.to === "/settings/llm")!;
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
      "sidebar-settings-/settings/llm",
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
      "sidebar-settings-/settings/llm",
    );
    expect(llmLink).not.toHaveAttribute("aria-disabled", "true");
  });

  it("wraps disabled-by-ACP desktop items in the explanatory tooltip", () => {
    // The mobile drawer already builds + shows this string ("Disabled
    // while Claude Code is active"); the desktop sidebar used to just
    // grey the item out with no explanation. SettingsDesktopSidebar
    // now formats the i18n string and forwards it as ``disabledReason``
    // to SidebarNavLink, which wraps the link in StyledTooltip when
    // both flags are set.
    renderSettingsNavigation(
      <SettingsNavigation
        isMobileMenuOpen={false}
        onCloseMobileMenu={vi.fn()}
        navigationItems={[
          {
            type: "item",
            item: condenserItem,
            disabled: true,
            disabledAgentName: "Claude Code",
          },
        ]}
      />,
    );

    // The StyledTooltip mock above renders its ``content`` prop into a
    // <span data-testid="styled-tooltip-content">…</span>. Its presence
    // proves SidebarNavLink wrapped the link with the explanatory
    // tooltip — i.e. ``disabledReason`` was forwarded. (We can't
    // assert on the resolved string content because the test
    // environment returns raw i18n keys without interpolation; the
    // wiring itself is what we care about. The enabled-control test
    // below verifies the wrap doesn't appear without the prop.)
    const desktopNav = screen.getByTestId("settings-navbar-desktop");
    expect(
      within(desktopNav).queryByTestId("styled-tooltip-content"),
    ).toBeInTheDocument();
  });

  it("does not wrap enabled items in a tooltip on the desktop sidebar", () => {
    renderSettingsNavigation(
      <SettingsNavigation
        isMobileMenuOpen={false}
        onCloseMobileMenu={vi.fn()}
        navigationItems={[{ type: "item", item: condenserItem }]}
      />,
    );
    // No ``disabled`` + no ``disabledReason`` → SidebarNavLink returns
    // the bare NavigationLink (no StyledTooltip wrap), so the mock's
    // marker element doesn't appear at all.
    const desktopNav = screen.getByTestId("settings-navbar-desktop");
    expect(
      within(desktopNav).queryByTestId("styled-tooltip-content"),
    ).not.toBeInTheDocument();
  });
});
