import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub, MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import {
  ActiveBackendProvider,
  useActiveBackendContext,
} from "#/contexts/active-backend-context";
import { BackendSelector } from "#/components/features/backends/backend-selector";
import {
  __resetEnvironmentSwitchOverlayForTests,
  EnvironmentSwitchOverlay,
} from "#/components/features/backends/environment-switch-overlay";

import {
  getCloudOrganizations,
  switchCloudOrganization,
  getCloudOrganizationMe,
  getCurrentCloudApiKey,
} from "#/api/cloud/organization-service.api";

vi.mock("#/api/cloud/organization-service.api", () => ({
  getCloudOrganizations: vi.fn(),
  switchCloudOrganization: vi.fn().mockResolvedValue(undefined),
  getCloudOrganizationMe: vi.fn(),
  getCurrentCloudApiKey: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ActiveBackendProvider>{ui}</ActiveBackendProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function TestSeed({
  onMount,
  children,
}: {
  onMount: (ctx: ReturnType<typeof useActiveBackendContext>) => void;
  children: React.ReactNode;
}) {
  const ctx = useActiveBackendContext();
  React.useEffect(() => {
    onMount(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return children as React.ReactElement;
}

async function openDropdown() {
  const user = userEvent.setup();
  const wrapper = screen.getByTestId("backend-selector");
  await user.click(within(wrapper).getByTestId("dropdown-trigger"));
  return user;
}

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.mocked(getCloudOrganizations).mockReset();
  vi.mocked(switchCloudOrganization).mockReset();
  vi.mocked(switchCloudOrganization).mockResolvedValue(undefined);
  vi.mocked(getCloudOrganizationMe).mockReset();
  vi.mocked(getCloudOrganizationMe).mockResolvedValue({
    orgId: "",
    userId: "",
  });
  // Default to the legacy-key fallback so existing assertions about
  // multiple orgs being visible still hold. Tests that exercise
  // org-filter behavior override this with an explicit orgId.
  vi.mocked(getCurrentCloudApiKey).mockReset();
  vi.mocked(getCurrentCloudApiKey).mockResolvedValue({
    orgId: null,
    isLegacyKey: true,
  });
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  __resetEnvironmentSwitchOverlayForTests();
});

describe("BackendSelector", () => {
  it("uses the bundled Local label by default", () => {
    renderWithProviders(<BackendSelector />);
    const wrapper = screen.getByTestId("backend-selector");
    const input = wrapper.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("BACKEND$LOCAL_ROW");
  });

  it("lists all registered backends in the dropdown", async () => {
    renderWithProviders(
      <TestSeed
        onMount={(ctx) => {
          ctx.addBackend({
            name: "Local 1",
            host: "http://localhost:9000",
            apiKey: "k",
            kind: "local",
          });
          ctx.addBackend({
            name: "Production",
            host: "https://app.all-hands.dev",
            apiKey: "b",
            kind: "cloud",
          });
        }}
      >
        <BackendSelector />
      </TestSeed>,
    );

    await openDropdown();

    expect(screen.getByText("BACKEND$LOCAL_ROW")).toBeInTheDocument();
    expect(screen.getByText("Local 1")).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
  });

  it("expands a cloud backend into one row per org and fires switch-org on select", async () => {
    vi.mocked(getCloudOrganizations).mockResolvedValue({
      items: [
        { id: "org-personal", name: "Personal" },
        { id: "org-2", name: "Acme Inc" },
      ],
      currentOrgId: "org-personal",
    });

    renderWithProviders(
      <TestSeed
        onMount={(ctx) => {
          ctx.addBackend({
            name: "Production",
            host: "https://app.all-hands.dev",
            apiKey: "bearer-key",
            kind: "cloud",
          });
        }}
      >
        <BackendSelector />
      </TestSeed>,
    );

    const user = await openDropdown();

    await waitFor(() => {
      expect(screen.getByText("Production – Personal")).toBeInTheDocument();
    });
    expect(screen.getByText("Production – Acme Inc")).toBeInTheDocument();

    await user.click(screen.getByText("Production – Acme Inc"));

    await waitFor(() => {
      expect(switchCloudOrganization).toHaveBeenCalled();
    });
    // The selector now passes an explicit backend so /switch lands on
    // the right cloud BEFORE the active selection flips.
    expect(switchCloudOrganization).toHaveBeenCalledWith(
      "org-2",
      expect.objectContaining({ host: "https://app.all-hands.dev" }),
    );
  });

  it("filters each cloud backend's org rows to the org its API key is bound to", async () => {
    // Both backends point at the same host; the user belongs to all three
    // orgs, but each API key is scoped to a different one. The selector
    // must show one row per backend, each labeled with its key's own org.
    vi.mocked(getCloudOrganizations).mockResolvedValue({
      items: [
        { id: "org-personal", name: "Personal" },
        { id: "org-acme", name: "Acme Inc" },
        { id: "org-beta", name: "Beta Co" },
      ],
      currentOrgId: "org-personal",
    });
    vi.mocked(getCurrentCloudApiKey).mockImplementation(async (backend) => ({
      orgId: backend?.apiKey === "key-personal" ? "org-personal" : "org-acme",
      isLegacyKey: false,
    }));

    renderWithProviders(
      <TestSeed
        onMount={(ctx) => {
          ctx.addBackend({
            name: "ProdPersonal",
            host: "https://app.all-hands.dev",
            apiKey: "key-personal",
            kind: "cloud",
          });
          ctx.addBackend({
            name: "ProdAcme",
            host: "https://app.all-hands.dev",
            apiKey: "key-acme",
            kind: "cloud",
          });
        }}
      >
        <BackendSelector />
      </TestSeed>,
    );

    await openDropdown();

    await waitFor(() => {
      expect(screen.getByText("ProdPersonal – Personal")).toBeInTheDocument();
    });
    expect(screen.getByText("ProdAcme – Acme Inc")).toBeInTheDocument();
    // Inaccessible orgs must not appear under either backend.
    expect(
      screen.queryByText("ProdPersonal – Acme Inc"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("ProdAcme – Personal")).not.toBeInTheDocument();
    expect(screen.queryByText(/Beta Co/)).not.toBeInTheDocument();
  });

  it("labels an org as 'Personal Workspace' when /me reports user_id === org.id", async () => {
    const personalOrgId = "0b93b5f2-5396-49f2-8d98-61f906184270";
    vi.mocked(getCloudOrganizations).mockResolvedValue({
      items: [
        {
          id: personalOrgId,
          // The auto-generated personal-workspace org has an unfriendly
          // backend-side name; the GUI must override it.
          name: `user_${personalOrgId}_org`,
        },
        { id: "org-2", name: "Acme Inc" },
      ],
      currentOrgId: personalOrgId,
    });
    // /me for the personal org returns user_id === org_id; for the team
    // org user_id !== org_id.
    vi.mocked(getCloudOrganizationMe).mockImplementation(async (orgId) => ({
      orgId,
      userId: orgId === personalOrgId ? personalOrgId : "some-user",
    }));

    renderWithProviders(
      <TestSeed
        onMount={(ctx) => {
          ctx.addBackend({
            name: "Production",
            host: "https://app.all-hands.dev",
            apiKey: "bearer-key",
            kind: "cloud",
          });
        }}
      >
        <BackendSelector />
      </TestSeed>,
    );

    await openDropdown();

    await waitFor(() => {
      expect(
        screen.getByText("Production – BACKEND$PERSONAL_WORKSPACE"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Production – Acme Inc")).toBeInTheDocument();
    // The auto-generated org name must NOT be rendered.
    expect(
      screen.queryByText(`Production – user_${personalOrgId}_org`),
    ).not.toBeInTheDocument();
  });

  it("self-heals (cloud, null) → (cloud, personal-workspace org) once orgs + /me resolve", async () => {
    const personalOrgId = "0b93b5f2-5396-49f2-8d98-61f906184270";
    vi.mocked(getCloudOrganizations).mockResolvedValue({
      items: [
        { id: personalOrgId, name: "Auto-generated personal" },
        { id: "org-2", name: "Acme Inc" },
      ],
      currentOrgId: personalOrgId,
    });
    vi.mocked(getCloudOrganizationMe).mockResolvedValue({
      orgId: personalOrgId,
      userId: personalOrgId,
    });

    let cloudId = "";
    renderWithProviders(
      <TestSeed
        onMount={(ctx) => {
          cloudId = ctx.addBackend({
            name: "Production",
            host: "https://app.all-hands.dev",
            apiKey: "bearer-key",
            kind: "cloud",
          }).id;
          // Simulate the post-refresh malformed state: active backend is
          // the cloud one but no orgId is set yet.
          ctx.setActive(cloudId, null);
        }}
      >
        <BackendSelector />
      </TestSeed>,
    );

    // After orgs + /me resolve, the selector should have snapped the
    // selection onto the personal-workspace org and fired switchOrg.
    await waitFor(() => {
      expect(switchCloudOrganization).toHaveBeenCalled();
    });
    expect(switchCloudOrganization).toHaveBeenCalledWith(
      personalOrgId,
      expect.objectContaining({ host: "https://app.all-hands.dev" }),
    );

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("openhands-active-backend") ?? "null",
      );
      expect(stored).toEqual({ backendId: cloudId, orgId: personalOrgId });
    });
  });

  it("switches the active backend when an option is selected", async () => {
    renderWithProviders(
      <TestSeed
        onMount={(ctx) => {
          ctx.addBackend({
            name: "Local 1",
            host: "http://localhost:9000",
            apiKey: "k",
            kind: "local",
          });
        }}
      >
        <BackendSelector />
      </TestSeed>,
    );

    const user = await openDropdown();
    await user.click(screen.getByText("Local 1"));

    const wrapper = screen.getByTestId("backend-selector");
    const input = wrapper.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("Local 1");
  });

  it("redirects to home when switching backends from a conversation route", async () => {
    function ConversationRoute() {
      return (
        <TestSeed
          onMount={(ctx) => {
            ctx.addBackend({
              name: "Local 1",
              host: "http://localhost:9000",
              apiKey: "k",
              kind: "local",
            });
          }}
        >
          <BackendSelector />
        </TestSeed>
      );
    }
    function HomeRoute() {
      return <div data-testid="home" />;
    }
    const RouterStub = createRoutesStub([
      { path: "/conversations/:conversationId", Component: ConversationRoute },
      { path: "/", Component: HomeRoute },
    ]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ActiveBackendProvider>
          <RouterStub initialEntries={["/conversations/abc"]} />
        </ActiveBackendProvider>
      </QueryClientProvider>,
    );

    const user = await openDropdown();
    await user.click(screen.getByText("Local 1"));

    expect(await screen.findByTestId("home")).toBeInTheDocument();
  });

  it("keeps the environment-switch overlay visible even after the selector unmounts mid-switch", async () => {
    // Arrange — selector and overlay are rendered in independent trees
    // so the selector can be torn down without taking the overlay with
    // it. This mirrors production: ContextMenuContainer's click-outside
    // handler unmounts UserContextMenu (and BackendSelector) the moment
    // the dropdown's portaled option list is clicked, so the trigger
    // must not depend on BackendSelector staying mounted.
    const selectorRender = renderWithProviders(
      <TestSeed
        onMount={(ctx) => {
          ctx.addBackend({
            name: "Acme Local",
            host: "http://localhost:9000",
            apiKey: "k",
            kind: "local",
          });
        }}
      >
        <BackendSelector />
      </TestSeed>,
    );
    render(<EnvironmentSwitchOverlay />);

    // Act — select a different backend, then immediately unmount the
    // selector (the click itself would do this in production via the
    // outside-click handler).
    const user = await openDropdown();
    await user.click(screen.getByText("Acme Local"));
    selectorRender.unmount();

    // Assert — the overlay is still in the DOM with the chosen target
    expect(screen.getByTestId("environment-switch-overlay")).toHaveAttribute(
      "data-target",
      "Acme Local",
    );
  });

  it("does not redirect when switching backends from a non-conversation route", async () => {
    function SettingsRoute() {
      return (
        <TestSeed
          onMount={(ctx) => {
            ctx.addBackend({
              name: "Local 1",
              host: "http://localhost:9000",
              apiKey: "k",
              kind: "local",
            });
          }}
        >
          <BackendSelector />
        </TestSeed>
      );
    }
    function HomeRoute() {
      return <div data-testid="home" />;
    }
    const RouterStub = createRoutesStub([
      { path: "/settings", Component: SettingsRoute },
      { path: "/", Component: HomeRoute },
    ]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ActiveBackendProvider>
          <RouterStub initialEntries={["/settings"]} />
        </ActiveBackendProvider>
      </QueryClientProvider>,
    );

    const user = await openDropdown();
    await user.click(screen.getByText("Local 1"));

    const wrapper = screen.getByTestId("backend-selector");
    const input = wrapper.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("Local 1");
    expect(screen.queryByTestId("home")).not.toBeInTheDocument();
  });
});
