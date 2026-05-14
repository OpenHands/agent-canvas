import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOCAL_BACKEND_ID } from "#/api/backend-registry/default-backend";
import {
  BACKEND_HEALTH_STORAGE_KEY,
  MAX_CONSECUTIVE_FAILURES,
} from "#/api/backend-registry/health-storage";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { __resetHealthStoreForTests } from "#/api/backend-registry/health-store";
import {
  ActiveBackendProvider,
  useActiveBackendContext,
} from "#/contexts/active-backend-context";
import { ManageBackendsModal } from "#/components/features/backends/manage-backends-modal";

const getServerInfoMock = vi.fn().mockResolvedValue({ version: "1.18.0" });

vi.mock("@openhands/typescript-client/clients", () => ({
  ServerClient: vi.fn(function ServerClientMock() {
    return { getServerInfo: getServerInfoMock };
  }),
}));

vi.mock("#/api/cloud/organization-service.api", () => ({
  getCurrentCloudApiKey: vi.fn().mockResolvedValue({
    orgId: null,
    isLegacyKey: true,
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>{ui}</ActiveBackendProvider>
    </QueryClientProvider>,
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

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  __resetHealthStoreForTests();
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  __resetHealthStoreForTests();
});

describe("ManageBackendsModal", () => {
  it("renders a status dot in each row", async () => {
    renderWithProviders(<ManageBackendsModal onClose={vi.fn()} />);

    expect(
      await screen.findByTestId("manage-backends-modal"),
    ).toBeInTheDocument();

    // The seeded default Local backend row is present and has a status
    // indicator alongside its name + host.
    const dots = await screen.findAllByTestId("backend-status-dot");
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it("opens the add-backend form when '+ Add backend' is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ManageBackendsModal onClose={vi.fn()} />);

    await user.click(screen.getByTestId("manage-backends-add"));

    expect(await screen.findByTestId("add-backend-modal")).toBeInTheDocument();
  });

  it("re-checks a disabled backend on open and clears stale persisted health when it recovers", async () => {
    window.localStorage.setItem(
      BACKEND_HEALTH_STORAGE_KEY,
      JSON.stringify({
        [DEFAULT_LOCAL_BACKEND_ID]: {
          consecutiveFailures: MAX_CONSECUTIVE_FAILURES,
          lastError: "Network Error",
          lastFailureAt: Date.now(),
          disabled: true,
        },
      }),
    );
    __resetHealthStoreForTests();

    renderWithProviders(<ManageBackendsModal onClose={vi.fn()} />);

    await waitFor(() => {
      expect(
        window.localStorage.getItem(BACKEND_HEALTH_STORAGE_KEY),
      ).toBeNull();
    });
  });

  it("opens an edit form pre-filled with the row's backend, and persists changes via updateBackend", async () => {
    const user = userEvent.setup();

    let backendId = "";
    renderWithProviders(
      <TestSeed
        onMount={(ctx) => {
          backendId = ctx.addBackend({
            name: "Acme Local",
            host: "http://localhost:9000",
            apiKey: "old-key",
            kind: "local",
          }).id;
        }}
      >
        <ManageBackendsModal onClose={vi.fn()} />
      </TestSeed>,
    );

    await user.click(
      await screen.findByTestId("manage-backends-edit-Acme Local"),
    );

    await screen.findByTestId("edit-backend-modal");
    const nameInput = screen.getByTestId(
      "edit-backend-name",
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Acme Local");

    // Update the host and save.
    const hostInput = screen.getByTestId(
      "edit-backend-host",
    ) as HTMLInputElement;
    await user.clear(hostInput);
    await user.type(hostInput, "http://localhost:9999");

    await user.click(screen.getByTestId("edit-backend-submit"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("edit-backend-modal"),
      ).not.toBeInTheDocument();
    });

    // The list now reflects the new host and the original id is preserved.
    const row = screen.getByTestId("manage-backends-row-Acme Local");
    expect(row.textContent).toContain("http://localhost:9999");
    expect(backendId).not.toBe("");
  });
});
