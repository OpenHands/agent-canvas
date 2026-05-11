import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("#/components/features/conversation-panel/new-conversation-button", () => ({
  NewConversationButton: () => <div data-testid="new-conversation-button" />,
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
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it.each([["/conversations"], ["/automations"], ["/automations/abc-123"], ["/settings"]])(
    "keeps the sidebar's default top padding on %s so spacing stays consistent with the conversations page",
    (currentPath) => {
      renderSidebar(currentPath);

      const sidebar = screen.getByRole("navigation").parentElement;
      expect(sidebar?.className).toMatch(/(^|\s)md:pt-4(\s|$)/);
      expect(sidebar?.className).not.toMatch(/(^|\s)md:pt-6\.5(\s|$)/);
    },
  );

  it("renders sidebar nav links with the default text color (text-[#8C8C8C])", () => {
    renderSidebar("/skills");

    const conversationsLink = screen.getByTestId("sidebar-conversations-link");
    expect(conversationsLink.className).toMatch(/(^|\s)text-\[#8C8C8C\](\s|$)/);
  });

  it("toggles between expanded and collapsed states and persists the choice", () => {
    const { unmount } = renderSidebar("/conversations");

    const sidebar = screen.getByRole("navigation").parentElement;
    expect(sidebar?.dataset.collapsed).toBe("false");

    const toggle = screen.getByTestId("sidebar-collapse-toggle");
    fireEvent.click(toggle);

    expect(sidebar?.dataset.collapsed).toBe("true");

    // The choice survives a remount via localStorage.
    unmount();
    renderSidebar("/conversations");
    const remountedSidebar = screen.getByRole("navigation").parentElement;
    expect(remountedSidebar?.dataset.collapsed).toBe("true");
  });

  it("expands the sidebar when the toggle is clicked from the collapsed state", () => {
    // Arrange: simulate a user whose sidebar was previously collapsed.
    window.localStorage.setItem("openhands-sidebar-collapsed", "true");
    renderSidebar("/conversations");

    // Act
    fireEvent.click(screen.getByTestId("sidebar-collapse-toggle"));

    // Assert: state flips back to expanded.
    const sidebar = screen.getByRole("navigation").parentElement;
    expect(sidebar?.dataset.collapsed).toBe("false");
  });

  it("renders icons for every top-level nav item so they remain meaningful in the collapsed rail", () => {
    renderSidebar("/conversations");

    for (const testId of [
      "sidebar-conversations-link",
      "sidebar-automations-link",
      "sidebar-skills-link",
    ]) {
      const link = screen.getByTestId(testId);
      expect(link.querySelector("svg")).not.toBeNull();
    }
  });
});
