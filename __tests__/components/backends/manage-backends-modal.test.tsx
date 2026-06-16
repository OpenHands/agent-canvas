import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SEEDED_DEFAULT_BACKEND_ID } from "#/api/backend-registry/default-backend";
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
import { BackendVersion } from "#/components/features/backends/backend-version";
import { BackendRow } from "#/components/features/backends/backend-row";
import { type Backend } from "#/api/backend-registry/types";

const getServerInfoMock = vi.fn().mockResolvedValue({ version: "1.28.0" });
const getSettingsMock = vi.fn().mockResolvedValue({});

vi.mock("@openhands/typescript-client/clients", () => ({
  ServerClient: vi.fn(function ServerClientMock() {
    return { getServerInfo: getServerInfoMock };
  }),
  SettingsClient: vi.fn(function SettingsClientMock() {
    return { getSettings: getSettingsMock };
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
  getServerInfoMock.mockReset();
  getServerInfoMock.mockResolvedValue({ version: "1.28.0" });
  getSettingsMock.mockReset();
  getSettingsMock.mockResolvedValue({});
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

  it("shows invalid API key status when the backend auth probe returns 401", async () => {
    getSettingsMock.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), {
        name: "HttpError",
        status: 401,
      }),
    );

    renderWithProviders(<ManageBackendsModal onClose={vi.fn()} />);

    const row = await screen.findByTestId("manage-backends-row-Local");
    await waitFor(() =>
      expect(
        screen.getByTestId("manage-backends-status-Local"),
      ).toHaveTextContent("AUTH$INVALID_KEY"),
    );
    expect(
      row.querySelector('[data-testid="backend-status-dot"]'),
    ).toHaveAttribute("data-status", "disconnected");
  });

  it("shows disconnected for a reachable backend below the compatible version floor", async () => {
    getServerInfoMock.mockResolvedValue({ version: "1.27.1" });

    renderWithProviders(<ManageBackendsModal onClose={vi.fn()} />);

    expect(
      await screen.findByTestId("manage-backends-version-Local"),
    ).toBeInTheDocument();
    expect(getServerInfoMock).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByTestId("manage-backends-status-Local"),
      ).toHaveTextContent("ONBOARDING$BACKEND_STATUS_DISCONNECTED"),
    );
    expect(
      screen.getByTestId("manage-backends-status-detail-Local"),
    ).toHaveTextContent("Agent Canvas requires agent-server 1.28.0 or newer");
  });

  it("closes when the header close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<ManageBackendsModal onClose={onClose} />);

    await user.click(
      await screen.findByTestId("close-manage-backends-modal"),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
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
        [SEEDED_DEFAULT_BACKEND_ID]: {
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

  it("preserves kind:cloud when renaming a cloud backend on a custom domain", async () => {
    const user = userEvent.setup();

    let backendId = "";
    renderWithProviders(
      <TestSeed
        onMount={(ctx) => {
          backendId = ctx.addBackend({
            name: "OHE Prod",
            host: "https://app.company.com",
            apiKey: "sk-oh-test",
            kind: "cloud",
          }).id;
        }}
      >
        <ManageBackendsModal onClose={vi.fn()} />
      </TestSeed>,
    );

    await user.click(
      await screen.findByTestId("manage-backends-edit-OHE Prod"),
    );
    await screen.findByTestId("edit-backend-modal");

    // Rename only -- host and kind are untouched
    const nameInput = screen.getByTestId(
      "edit-backend-name",
    ) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "OHE Prod Renamed");

    await user.click(screen.getByTestId("edit-backend-submit"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("edit-backend-modal"),
      ).not.toBeInTheDocument();
    });

    const stored = JSON.parse(
      window.localStorage.getItem("openhands-backends") ?? "[]",
    );
    const updated = stored.find(
      (b: { id: string }) => b.id === backendId,
    );
    expect(updated).toMatchObject({
      name: "OHE Prod Renamed",
      kind: "cloud",
    });
  });

  it("closes the edit form when the header close button is clicked", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <TestSeed
        onMount={(ctx) => {
          ctx.addBackend({
            name: "Acme Local",
            host: "http://localhost:9000",
            apiKey: "old-key",
            kind: "local",
          });
        }}
      >
        <ManageBackendsModal onClose={vi.fn()} />
      </TestSeed>,
    );

    await user.click(
      await screen.findByTestId("manage-backends-edit-Acme Local"),
    );
    await screen.findByTestId("edit-backend-modal");

    await user.click(screen.getByTestId("edit-backend-close"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("edit-backend-modal"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("manage-backends-modal")).toBeInTheDocument();
  });
});

function renderInQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const cloudBackend: Backend = {
  id: "backend-cloud",
  name: "Acme Cloud",
  host: "https://app.acme.com",
  apiKey: "sk-test",
  kind: "cloud",
};

// Focused coverage for the two components extracted out of this file. The
// ManageBackendsModal suite above already exercises them through the modal;
// these assert behavior unique to each extracted component, rendered without
// ActiveBackendProvider so no seeded-backend health probe interferes.
describe("BackendVersion", () => {
  it("renders no version badge and skips the probe for a non-local backend", () => {
    // The version probe is gated on `kind === "local"`, so a cloud backend
    // never fetches or shows a version.
    renderInQueryClient(<BackendVersion backend={cloudBackend} />);

    expect(
      screen.queryByTestId(`manage-backends-version-${cloudBackend.name}`),
    ).not.toBeInTheDocument();
    expect(getServerInfoMock).not.toHaveBeenCalled();
  });
});

describe("BackendRow", () => {
  it("disables row selection when the backend is not connected", () => {
    renderInQueryClient(
      <ul>
        <BackendRow
          backend={cloudBackend}
          health={undefined}
          onSelect={vi.fn()}
          onEdit={vi.fn()}
          onRemove={vi.fn()}
        />
      </ul>,
    );

    const row = screen.getByTestId(`manage-backends-row-${cloudBackend.name}`);
    const selectButton = within(row)
      .getByText(cloudBackend.name)
      .closest("button");
    expect(selectButton).toBeDisabled();
  });
});
