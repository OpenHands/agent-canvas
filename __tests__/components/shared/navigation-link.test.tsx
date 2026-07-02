import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  NavigationProvider,
  type NavigationContextValue,
} from "#/context/navigation-context";
import { NavigationLink } from "#/components/shared/navigation-link";

function renderNavigationLink(
  currentPath = "/",
  overrides: Partial<NavigationContextValue> = {},
) {
  const value: NavigationContextValue = {
    currentPath,
    conversationId: null,
    isNavigating: false,
    navigate: vi.fn(),
    ...overrides,
  };

  const result = render(
    <NavigationProvider value={value}>
      <NavigationLink to="/settings/mcp">MCP</NavigationLink>
    </NavigationProvider>,
  );

  return {
    ...result,
    navigate: value.navigate,
  };
}

describe("NavigationLink", () => {
  it("renders the destination href and active state from navigation context", () => {
    renderNavigationLink("/settings/mcp");

    expect(screen.getByRole("link", { name: "MCP" })).toHaveAttribute(
      "href",
      "/settings/mcp",
    );
    expect(screen.getByRole("link", { name: "MCP" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("uses the injected navigate callback on click", () => {
    const { navigate } = renderNavigationLink();
    const link = screen.getByRole("link", { name: "MCP" });

    fireEvent.click(link);

    expect(navigate).toHaveBeenCalledWith("/settings/mcp", {
      replace: false,
    });
  });

  it("uses href override for the anchor element when provided", () => {
    const value: NavigationContextValue = {
      currentPath: "/",
      conversationId: null,
      isNavigating: false,
      navigate: vi.fn(),
    };

    render(
      <NavigationProvider value={value}>
        <NavigationLink
          to="/conversations/c1"
          href="/conversations/c1?bid=backend-1&oid=org-1"
        >
          Conv
        </NavigationLink>
      </NavigationProvider>,
    );

    const link = screen.getByRole("link", { name: "Conv" });
    expect(link).toHaveAttribute(
      "href",
      "/conversations/c1?bid=backend-1&oid=org-1",
    );
  });

  it("still uses to for navigate on normal click when href is provided", () => {
    const navigate = vi.fn();
    const value: NavigationContextValue = {
      currentPath: "/",
      conversationId: null,
      isNavigating: false,
      navigate,
    };

    render(
      <NavigationProvider value={value}>
        <NavigationLink
          to="/conversations/c1"
          href="/conversations/c1?bid=backend-1"
        >
          Conv
        </NavigationLink>
      </NavigationProvider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Conv" }));

    expect(navigate).toHaveBeenCalledWith("/conversations/c1", {
      replace: false,
    });
  });

  it("computes active state from to, not href", () => {
    const value: NavigationContextValue = {
      currentPath: "/conversations/c1",
      conversationId: "c1",
      isNavigating: false,
      navigate: vi.fn(),
    };

    render(
      <NavigationProvider value={value}>
        <NavigationLink
          to="/conversations/c1"
          href="/conversations/c1?bid=backend-1"
        >
          Conv
        </NavigationLink>
      </NavigationProvider>,
    );

    expect(screen.getByRole("link", { name: "Conv" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
