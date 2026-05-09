import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "#/components/features/sidebar/sidebar";
import {
  NavigationProvider,
  type NavigationContextValue,
} from "#/context/navigation-context";

vi.mock("#/hooks/query/use-git-user", () => ({
  useGitUser: () => ({ data: undefined, isFetching: false }),
}));

vi.mock("#/hooks/query/use-config", () => ({
  useConfig: () => ({ data: { feature_flags: {} } }),
}));

vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => ({
    data: { email_verified: true },
    error: null,
    isError: false,
    isFetching: false,
  }),
  getErrorStatus: () => undefined,
}));

vi.mock("#/components/shared/buttons/styled-tooltip", () => ({
  StyledTooltip: ({ children }: { children: unknown }) => children,
}));

vi.mock("#/components/shared/buttons/openhands-logo-button", () => ({
  OpenHandsLogoButton: () => <div data-testid="logo-button" />,
}));

vi.mock("#/components/shared/buttons/new-project-button", () => ({
  NewProjectButton: () => <div data-testid="new-project-button" />,
}));

vi.mock("#/components/shared/buttons/conversation-panel-button", () => ({
  ConversationPanelButton: () => (
    <div data-testid="conversation-panel-button" />
  ),
}));

vi.mock("#/components/shared/buttons/automations-button", () => ({
  AutomationsButton: () => <div data-testid="automations-button" />,
}));

vi.mock("#/components/features/sidebar/user-actions", () => ({
  UserActions: () => <div data-testid="user-actions" />,
}));

vi.mock("#/components/features/conversation-panel/conversation-panel", () => ({
  ConversationPanel: () => null,
}));

vi.mock(
  "#/components/features/conversation-panel/conversation-panel-wrapper",
  () => ({
    ConversationPanelWrapper: () => null,
  }),
);

vi.mock("#/components/shared/modals/settings/settings-modal", () => ({
  SettingsModal: () => null,
}));

vi.mock("#/components/features/backends/backend-selector", () => ({
  BackendSelector: () => <div data-testid="backend-selector" />,
}));

vi.mock("#/components/features/sidebar/sidebar-conversation-list", () => ({
  SidebarConversationList: () => <div data-testid="sidebar-conversation-list" />,
}));

vi.mock("#/hooks/use-settings-nav-items", () => ({
  useSettingsNavItems: () => [],
}));


function renderSidebar(currentPath: string) {
  const value: NavigationContextValue = {
    currentPath,
    conversationId: null,
    isNavigating: false,
    navigate: vi.fn(),
  };

  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NavigationProvider value={value}>
        <Sidebar />
      </NavigationProvider>
    </QueryClientProvider>,
  );
}

describe("Sidebar", () => {
  it.each([["/automations"], ["/automations/abc-123"]])(
    "applies the standalone vertical padding on %s so the sidebar has breathing room when the root layout's padding is dropped",
    (currentPath) => {
      renderSidebar(currentPath);

      const sidebar = screen.getByRole("navigation").parentElement;
      expect(sidebar?.className).toMatch(/(^|\s)md:pt-6\.5(\s|$)/);
      expect(sidebar?.className).toMatch(/(^|\s)md:pb-3(\s|$)/);
    },
  );

  it("does not apply the standalone vertical padding on routes that still use the root layout's padding", () => {
    renderSidebar("/settings");

    const sidebar = screen.getByRole("navigation").parentElement;
    expect(sidebar?.className).not.toMatch(/(^|\s)md:pt-6\.5(\s|$)/);
    expect(sidebar?.className).not.toMatch(/(^|\s)md:pb-3(\s|$)/);
  });
});
