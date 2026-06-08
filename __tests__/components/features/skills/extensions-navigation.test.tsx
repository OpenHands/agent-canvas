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

  // Regression: the nav used to suppress itself at iPad-portrait widths
  // (768–1023px) whenever the primary Sidebar was expanded, leaving users
  // on /skills, /mcp, and /plugins with no way to switch between those
  // pages. It must stay rendered there, like the Settings secondary nav.
  describe("tablet viewports", () => {
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
      // The Zustand sidebar store is a module singleton — reset it so this
      // suite's state doesn't bleed into other tests.
      useSidebarStore.setState({ collapsed: false });
    });

    it("stays rendered at iPad portrait width while the Sidebar is expanded", () => {
      // Arrange: iPad Air portrait viewport with the primary Sidebar
      // expanded — the exact conditions that previously hid the nav.
      setViewport(820);
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
