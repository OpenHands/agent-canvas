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
  it.each([["/conversations"], ["/automations"], ["/automations/abc-123"], ["/settings"]])(
    "keeps the sidebar's default top padding on %s so spacing stays consistent with the conversations page",
    (currentPath) => {
      renderSidebar(currentPath);

      const sidebar = screen.getByRole("navigation").parentElement;
      expect(sidebar?.className).toMatch(/(^|\s)md:pt-4(\s|$)/);
      expect(sidebar?.className).not.toMatch(/(^|\s)md:pt-6\.5(\s|$)/);
    },
  );

  it("renders sidebar nav links and the settings toggle with the default text color shared by the settings page nav (text-[#8C8C8C])", () => {
    renderSidebar("/skills");

    const conversationsLink = screen.getByTestId("sidebar-conversations-link");
    expect(conversationsLink.className).toMatch(/(^|\s)text-\[#8C8C8C\](\s|$)/);

    const settingsToggle = screen.getByTestId("sidebar-settings-toggle");
    expect(settingsToggle.className).toMatch(/(^|\s)text-\[#8C8C8C\](\s|$)/);
  });
});
