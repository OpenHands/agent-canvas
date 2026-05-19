import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

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
});
