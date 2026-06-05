import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { useSidebarStore } from "#/stores/sidebar-store";

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
    renderExtensionsNavigation(<ExtensionsNavigation />);

    const nav = screen.getByTestId("extensions-navbar-desktop");
    const mcpItem = within(nav).getByTestId("sidebar-extensions-/mcp");
    expect(mcpItem).not.toHaveAttribute("aria-disabled");
    // `NavigationLink` renders as <a> with an href so direct URL
    // navigation works.
    expect(mcpItem.tagName).toBe("A");
  });

  it("keeps the MCP item clickable when ACP is active", () => {
    // ACP agents now forward ``mcp_config`` to their subprocess at session
    // creation, so the MCP page is meaningful under ACP too — it is no
    // longer greyed out (unlike /settings and /settings/condenser, which
    // stay inert for ACP).
    renderExtensionsNavigation(<ExtensionsNavigation />);

    const nav = screen.getByTestId("extensions-navbar-desktop");
    const mcpItem = within(nav).getByTestId("sidebar-extensions-/mcp");
    expect(mcpItem).not.toHaveAttribute("aria-disabled");
    expect(mcpItem.tagName).toBe("A");
  });

  it("leaves the Skills item clickable", () => {
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
