import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsNavigation } from "#/components/features/settings/settings-navigation";
import { SettingsDesktopSidebar } from "#/components/features/settings/settings-desktop-sidebar";
import { SettingsMobileDrawer } from "#/components/features/settings/settings-mobile-drawer";
import {
  AGENTS_HUB_NAV_ITEMS,
  type SettingsNavRenderedItem,
} from "#/constants/settings-nav";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

// HeroUI's Tooltip only mounts content on real-DOM interaction, which jsdom +
// userEvent.hover doesn't reliably fire — stub the wrapper to render eagerly.
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

const llmItem = AGENTS_HUB_NAV_ITEMS.find((item) => item.to === "/agents/llm")!;
const secretsItem = AGENTS_HUB_NAV_ITEMS.find(
  (item) => item.to === "/agents/secrets",
)!;

const baseItems: SettingsNavRenderedItem[] = [
  {
    type: "header",
    text: "SETTINGS$AGENTS_HUB_BUILDING_BLOCKS_HEADER" as never,
  },
  { type: "item", item: llmItem },
  { type: "divider" },
  { type: "item", item: secretsItem },
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
  it("renders the provided navigation items, headers, and dividers", () => {
    renderSettingsNavigation(
      <SettingsNavigation
        isMobileMenuOpen={false}
        onCloseMobileMenu={vi.fn()}
        navigationItems={baseItems}
      />,
    );

    expect(screen.getByTestId("settings-navbar")).toBeInTheDocument();
    expect(
      screen.getAllByText("SETTINGS$AGENTS_HUB_BUILDING_BLOCKS_HEADER").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("SETTINGS$NAV_LLM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SETTINGS$NAV_SECRETS").length).toBeGreaterThan(
      0,
    );
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
      screen.getByRole("button", { name: "SIDEBAR$CLOSE_MENU" }),
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

  it("propagates the disabled flag to the desktop sidebar", () => {
    // The components still support disabled items (passed explicitly); both
    // surfaces must render them non-interactive.
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
            item: secretsItem,
            disabled: true,
            disabledAgentName: "Claude Code",
          },
        ]}
      />,
    );

    const desktopNav = screen.getByTestId("settings-navbar-desktop");
    expect(
      within(desktopNav).getByTestId("sidebar-settings-/agents/llm"),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(desktopNav).getByTestId("sidebar-settings-/agents/secrets"),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps pointer events on disabled-by-ACP items so the hover tooltip can open", () => {
    // Regression for the missing "Disabled while {agent} is active" tooltip
    // on desktop: the disabled link used to also get ``pointer-events-none``,
    // which stops HeroUI's pointer-driven Tooltip from ever firing — so the
    // explanation never reached the user (reported on macOS desktop). A
    // disabled item that HAS a reason must stay greyed (opacity-50) but keep
    // receiving pointer events.
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
        ]}
      />,
    );

    const desktopNav = screen.getByTestId("settings-navbar-desktop");
    const llmLink = within(desktopNav).getByTestId(
      "sidebar-settings-/settings/llm",
    );
    expect(llmLink).toHaveAttribute("aria-disabled", "true");
    expect(llmLink.className).toContain("opacity-50");
    expect(llmLink.className).not.toContain("pointer-events-none");
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
    expect(
      within(desktopNav).getByTestId("sidebar-settings-/agents/llm"),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("wraps disabled desktop items in the explanatory tooltip", () => {
    renderSettingsNavigation(
      <SettingsNavigation
        isMobileMenuOpen={false}
        onCloseMobileMenu={vi.fn()}
        navigationItems={[
          {
            type: "item",
            item: secretsItem,
            disabled: true,
            disabledAgentName: "Claude Code",
          },
        ]}
      />,
    );

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
        navigationItems={[{ type: "item", item: secretsItem }]}
      />,
    );
    const desktopNav = screen.getByTestId("settings-navbar-desktop");
    expect(
      within(desktopNav).queryByTestId("styled-tooltip-content"),
    ).not.toBeInTheDocument();
  });
});

describe("SettingsDesktopSidebar", () => {
  it("renders a link per item and now also renders grouped headers", () => {
    // baseItems holds one header, two items, and one divider. The desktop rail
    // renders headers/dividers (for the Agents hub grouping) alongside links.
    renderSettingsNavigation(
      <SettingsDesktopSidebar navigationItems={baseItems} />,
    );

    const desktopNav = screen.getByTestId("settings-navbar-desktop");
    const links = within(desktopNav).getAllByTestId(/^sidebar-settings-/);

    expect(links).toHaveLength(2);
    expect(
      within(desktopNav).getByTestId("sidebar-settings-/agents/llm"),
    ).toBeInTheDocument();
    expect(
      within(desktopNav).getByTestId("sidebar-settings-/agents/secrets"),
    ).toBeInTheDocument();
    // The grouping header now renders on desktop (previously filtered out).
    expect(
      within(desktopNav).getByText(
        "SETTINGS$AGENTS_HUB_BUILDING_BLOCKS_HEADER",
      ),
    ).toBeInTheDocument();
  });
});

describe("SettingsMobileDrawer", () => {
  it("renders a disabled item as a non-interactive entry that keeps its label", () => {
    renderSettingsNavigation(
      <SettingsMobileDrawer
        isMobileMenuOpen
        onCloseMobileMenu={vi.fn()}
        navigationItems={[
          {
            type: "item",
            item: llmItem,
            disabled: true,
            disabledAgentName: "Claude Code",
          },
        ]}
      />,
    );

    const disabledItem = screen.getByTestId(
      "settings-nav-link-disabled-/agents/llm",
    );
    expect(disabledItem).toHaveAttribute("aria-disabled", "true");
    expect(
      within(disabledItem).getByText("SETTINGS$NAV_LLM"),
    ).toBeInTheDocument();
  });
});
