import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "#/components/features/sidebar/sidebar";
import {
  NavigationProvider,
  type NavigationContextValue,
} from "#/context/navigation-context";

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

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackendContext: () => ({
    backends: [{ id: "local", name: "Local", kind: "local" }],
    active: {
      backend: { id: "local", name: "Local", kind: "local" },
      orgId: null,
    },
    setActive: vi.fn(),
  }),
}));

vi.mock("#/hooks/query/use-backends-health", () => ({
  useBackendsHealth: () => ({
    local: { isConnected: true },
  }),
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
  BackendSelector: ({
    onSelectOption,
    onOpenAddBackend,
    onOpenManageBackends,
  }: {
    onSelectOption?: () => void;
    onOpenAddBackend?: () => void;
    onOpenManageBackends?: () => void;
  } = {}) => (
    <div data-testid="backend-selector">
      {/*
        Mimic a backend OPTION row in the dropdown menu — same role/tag the
        real Dropdown emits. Clicking this should not bubble up to the rail
        collapse handler.
       */}
      <ul>
        <li
          data-testid="mock-backend-option"
          role="option"
          aria-selected={false}
          onClick={() => onSelectOption?.()}
        >
          Switch backend
        </li>
      </ul>
      <button
        type="button"
        data-testid="mock-add-backend"
        onClick={() => onOpenAddBackend?.()}
      >
        Add Backend
      </button>
      <button
        type="button"
        data-testid="mock-manage-backends"
        onClick={() => onOpenManageBackends?.()}
      >
        Manage Backends
      </button>
    </div>
  ),
}));

vi.mock("#/components/features/backends/add-backend-modal", () => ({
  AddBackendModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="add-backend-modal">
      <button
        type="button"
        data-testid="add-backend-modal-close"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  ),
}));

vi.mock("#/components/features/backends/manage-backends-modal", () => ({
  ManageBackendsModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="manage-backends-modal">
      <button
        type="button"
        data-testid="manage-backends-modal-close"
        onClick={onClose}
      >
        Close
      </button>
    </div>
  ),
}));

vi.mock(
  "#/components/features/conversation-panel/new-conversation-button",
  () => ({
    NewConversationButton: () => <div data-testid="new-conversation-button" />,
  }),
);

vi.mock("#/components/features/sidebar/sidebar-conversation-list", () => ({
  SidebarConversationList: () => (
    <div data-testid="sidebar-conversation-list" />
  ),
}));

vi.mock("#/hooks/use-settings-nav-items", () => ({
  useSettingsNavItems: () => [],
}));

function renderSidebar(currentPath: string) {
  const navigate = vi.fn();
  const value: NavigationContextValue = {
    currentPath,
    conversationId: null,
    isNavigating: false,
    navigate,
  };

  const rendered = render(
    <QueryClientProvider client={new QueryClient()}>
      <NavigationProvider value={value}>
        <Sidebar />
      </NavigationProvider>
    </QueryClientProvider>,
  );

  return { ...rendered, navigate };
}

describe("Sidebar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it.each([
    ["/conversations"],
    ["/automations"],
    ["/automations/abc-123"],
    ["/settings"],
  ])(
    "keeps the sidebar's default top padding on %s so spacing stays consistent with the conversations page",
    (currentPath) => {
      renderSidebar(currentPath);

      const sidebar = screen.getByRole("navigation").parentElement;
      expect(sidebar?.className).toMatch(/(^|\s)md:pt-4(\s|$)/);
      expect(sidebar?.className).not.toMatch(/(^|\s)md:pt-6\.5(\s|$)/);
    },
  );

  it("renders sidebar nav links with the muted default text color", () => {
    renderSidebar("/skills");

    const conversationsLink = screen.getByTestId("sidebar-conversations-link");
    expect(conversationsLink.className).toMatch(
      /(^|\s)text-\[var\(--oh-muted\)\](\s|$)/,
    );
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

  it("expands the sidebar when collapsed rail empty space is clicked", () => {
    window.localStorage.setItem("openhands-sidebar-collapsed", "true");
    renderSidebar("/conversations");

    const sidebar = screen.getByRole("navigation").parentElement;
    expect(sidebar?.dataset.collapsed).toBe("true");

    if (!sidebar) {
      throw new Error("Sidebar root not found");
    }

    fireEvent.click(sidebar);
    expect(sidebar.dataset.collapsed).toBe("false");
  });

  it("shows collapsed server/settings action icons when sidebar is collapsed", () => {
    window.localStorage.setItem("openhands-sidebar-collapsed", "true");
    renderSidebar("/conversations");

    expect(screen.getByTestId("collapsed-settings-link")).toBeInTheDocument();
    expect(
      screen.getByTestId("collapsed-backend-selector-link"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("backend-status-dot")).toBeInTheDocument();
  });

  it("navigates to settings when collapsed settings icon is clicked", () => {
    window.localStorage.setItem("openhands-sidebar-collapsed", "true");
    const { navigate } = renderSidebar("/conversations");

    fireEvent.click(screen.getByTestId("collapsed-settings-link"));
    expect(navigate).toHaveBeenCalledWith("/settings");
  });

  it("opts the collapsed Settings button into cursor-pointer so hovering it shows the pointer affordance", () => {
    // Arrange: render with the sidebar collapsed so the Settings icon is mounted.
    window.localStorage.setItem("openhands-sidebar-collapsed", "true");
    renderSidebar("/conversations");

    // Act: locate the Settings button the user hovers.
    const settingsButton = screen.getByTestId("collapsed-settings-link");

    // Assert: Tailwind v4 preflight resets <button> cursor to default, so
    // the button must opt back into cursor-pointer for the hover affordance.
    expect(settingsButton.className).toMatch(/(^|\s)cursor-pointer(\s|$)/);
  });

  it("opens the backend popover when hovering the collapsed backend icon", async () => {
    window.localStorage.setItem("openhands-sidebar-collapsed", "true");
    renderSidebar("/conversations");

    expect(screen.queryByTestId("backend-selector")).not.toBeInTheDocument();
    const trigger = screen.getByTestId("collapsed-backend-selector-link");
    const wrapper = trigger.parentElement;
    if (!wrapper) throw new Error("Popover wrapper not found");
    fireEvent.mouseEnter(wrapper);
    expect(await screen.findByTestId("backend-selector")).toBeInTheDocument();
  });

  it("does NOT expand the sidebar when a backend option in the popover is clicked", async () => {
    // Bug: clicking a backend <li role='option'> bubbled up to the aside's
    // rail-collapse handler (which only bails on a/button/[role=button]),
    // so selecting a backend would expand the sidebar mid-switch.
    window.localStorage.setItem("openhands-sidebar-collapsed", "true");
    renderSidebar("/conversations");

    const sidebar = screen.getByRole("navigation").parentElement;
    if (!sidebar) throw new Error("Sidebar not found");
    expect(sidebar.dataset.collapsed).toBe("true");

    const trigger = screen.getByTestId("collapsed-backend-selector-link");
    const popoverContainer = trigger.parentElement;
    if (!popoverContainer) throw new Error("Popover container not found");
    fireEvent.mouseEnter(popoverContainer);
    const option = await screen.findByTestId("mock-backend-option");

    fireEvent.click(option);

    // Sidebar should remain collapsed — selecting a backend should not
    // collapse-toggle the rail.
    expect(sidebar.dataset.collapsed).toBe("true");
  });

  it("keeps the Add Backend modal open after the popover closes", async () => {
    // Bug: modal state lived inside BackendSelector; once the cursor moved
    // out of the popover toward the centred modal, mouseLeave closed the
    // popover, which unmounted BackendSelector and tore the modal down with
    // it. Modal state must live above the popover to survive its unmount.
    window.localStorage.setItem("openhands-sidebar-collapsed", "true");
    renderSidebar("/conversations");

    const trigger = screen.getByTestId("collapsed-backend-selector-link");
    const popoverContainer = trigger.parentElement;
    if (!popoverContainer) throw new Error("Popover container not found");
    fireEvent.mouseEnter(popoverContainer);

    fireEvent.click(await screen.findByTestId("mock-add-backend"));

    // Cursor moves toward the modal -> popover times out and closes.
    fireEvent.mouseLeave(popoverContainer);
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });

    expect(screen.queryByTestId("backend-selector")).not.toBeInTheDocument();
    expect(await screen.findByTestId("add-backend-modal")).toBeInTheDocument();
  });

  it("keeps the Manage Backends modal open after the popover closes", async () => {
    window.localStorage.setItem("openhands-sidebar-collapsed", "true");
    renderSidebar("/conversations");

    const trigger = screen.getByTestId("collapsed-backend-selector-link");
    const popoverContainer = trigger.parentElement;
    if (!popoverContainer) throw new Error("Popover container not found");
    fireEvent.mouseEnter(popoverContainer);

    fireEvent.click(await screen.findByTestId("mock-manage-backends"));
    fireEvent.mouseLeave(popoverContainer);
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });

    expect(screen.queryByTestId("backend-selector")).not.toBeInTheDocument();
    expect(
      await screen.findByTestId("manage-backends-modal"),
    ).toBeInTheDocument();
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
