import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { useSidebarStore } from "#/stores/sidebar-store";

const useSettingsMock = vi.fn();
vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => useSettingsMock(),
}));

// HeroUI's Tooltip only mounts content on real-DOM hover; stub the
// wrapper to render content eagerly so we can assert "the tooltip
// would say X" via the DOM. Mirrors the pattern in
// ``settings-navigation.test.tsx``.
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

import { ExtensionsNavigation } from "#/components/features/skills/extensions-navigation";

function renderExtensionsNavigation(ui: ReactNode) {
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

describe("ExtensionsNavigation", () => {
  it("renders the MCP item as a clickable link for non-ACP agents", () => {
    useSettingsMock.mockReturnValue({
      data: { agent_settings: { agent_kind: "openhands" } },
    });

    renderExtensionsNavigation(<ExtensionsNavigation />);

    const nav = screen.getByTestId("extensions-navbar-desktop");
    const mcpItem = within(nav).getByTestId("sidebar-extensions-/mcp");
    expect(mcpItem).not.toHaveAttribute("aria-disabled");
    // Active link — `NavigationLink` renders as <a>; the disabled
    // branch renders <span>. Tagging matters because the disabled
    // version has no href, breaking direct URL navigation.
    expect(mcpItem.tagName).toBe("A");
  });

  it("greys out the MCP item and wraps it in the ACP tooltip when ACP is active", () => {
    // Regression guard for the comment in PR #416 review: with an ACP
    // agent active, /mcp configuration is silently no-op (the SDK's
    // ``ACPAgent`` rejects ``mcp_config`` on init). Greying the nav
    // item plus the explanatory tooltip mirrors how /settings,
    // /settings/condenser already behave under ACP.
    useSettingsMock.mockReturnValue({
      data: {
        agent_settings: { agent_kind: "acp", acp_server: "claude-code" },
      },
    });

    renderExtensionsNavigation(<ExtensionsNavigation />);

    const nav = screen.getByTestId("extensions-navbar-desktop");
    const mcpItem = within(nav).getByTestId("sidebar-extensions-/mcp");
    expect(mcpItem).toHaveAttribute("aria-disabled", "true");
    // Disabled rendering uses <span>, not <a> — no href means no
    // accidental navigation if the user keyboard-tabs onto it.
    expect(mcpItem.tagName).toBe("SPAN");
    // The StyledTooltip mock writes its ``content`` prop into a
    // <span data-testid="styled-tooltip-content">. Its presence proves
    // the disabled branch wrapped the link with the explanatory
    // tooltip; the absence on enabled control (see Skills below)
    // proves we don't over-wrap.
    expect(
      within(nav).queryByTestId("styled-tooltip-content"),
    ).toBeInTheDocument();
  });

  it("leaves the Skills item clickable even when ACP is active", () => {
    // Skills isn't ACP-gated — the ACP subprocess can still benefit
    // from rendered skills in its <CUSTOM_SECRETS>/system suffix. Only
    // /mcp goes grey; /skills stays a normal link.
    useSettingsMock.mockReturnValue({
      data: {
        agent_settings: { agent_kind: "acp", acp_server: "claude-code" },
      },
    });

    renderExtensionsNavigation(<ExtensionsNavigation />);

    const nav = screen.getByTestId("extensions-navbar-desktop");
    const skillsItem = within(nav).getByTestId("sidebar-extensions-/skills");
    expect(skillsItem).not.toHaveAttribute("aria-disabled");
    expect(skillsItem.tagName).toBe("A");
  });

  // When the primary Sidebar is expanded, an iPad-portrait viewport
  // (768–1023px) doesn't have horizontal room for both sidebars plus the
  // page content, so this nav suppresses itself. The three cases below
  // pin down the gating logic by varying one input at a time.
  describe("suppresses itself when the Sidebar is expanded at iPad portrait widths", () => {
    const originalInnerWidth = window.innerWidth;

    function setViewport(width: number) {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: width,
      });
    }

    beforeEach(() => {
      // Arrange: a non-ACP agent so every nav item is clickable and the
      // hide rule is the only thing that can suppress the aside.
      useSettingsMock.mockReturnValue({
        data: { agent_settings: { agent_kind: "openhands" } },
      });
    });

    afterEach(() => {
      setViewport(originalInnerWidth);
      // The Zustand sidebar store is a module singleton — reset it so
      // a `collapsed: true` from one case doesn't bleed into the next.
      useSidebarStore.setState({ collapsed: false });
    });

    it("hides the aside when the Sidebar is expanded and the viewport is in the iPad portrait range (768–1023)", () => {
      // Arrange: iPad Air portrait, Sidebar expanded.
      setViewport(820);
      useSidebarStore.setState({ collapsed: false });

      // Act
      renderExtensionsNavigation(<ExtensionsNavigation />);

      // Assert: no aside renders, freeing the row for the page's main
      // column to take the full width.
      expect(
        screen.queryByTestId("extensions-navbar-desktop"),
      ).not.toBeInTheDocument();
    });

    it("renders the aside in the iPad portrait range once the Sidebar is collapsed", () => {
      // Arrange: same viewport as above, but the user has collapsed the
      // primary Sidebar to the icon rail, so there's room for this nav.
      setViewport(820);
      useSidebarStore.setState({ collapsed: true });

      // Act
      renderExtensionsNavigation(<ExtensionsNavigation />);

      // Assert
      expect(
        screen.getByTestId("extensions-navbar-desktop"),
      ).toBeInTheDocument();
    });

    it("renders the aside at lg+ viewports even when the Sidebar is expanded", () => {
      // Arrange: desktop viewport (≥1024). The rule only applies in the
      // md→<lg band, so an expanded Sidebar here should not suppress us.
      setViewport(1280);
      useSidebarStore.setState({ collapsed: false });

      // Act
      renderExtensionsNavigation(<ExtensionsNavigation />);

      // Assert
      expect(
        screen.getByTestId("extensions-navbar-desktop"),
      ).toBeInTheDocument();
    });
  });
});
