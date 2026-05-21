import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, vi, beforeEach, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { FolderBrowserModal } from "../../../../src/components/features/home/workspace-dropdown/folder-browser-modal";
import type { ResolvedActiveBackend } from "../../../../src/api/backend-registry/types";

const LOCAL_HOME = "/Users/joepelletier";
const REMOTE_HOME = "/Users/homeadmin";

const LOCAL_BACKEND: ResolvedActiveBackend = {
  backend: {
    id: "local-1",
    name: "Local",
    host: "http://localhost:18000",
    apiKey: "",
    kind: "local",
  },
  orgId: null,
};

const REMOTE_BACKEND: ResolvedActiveBackend = {
  backend: {
    id: "remote-2",
    name: "Home Server",
    host: "http://home.lan:18000",
    apiKey: "",
    kind: "local",
  },
  orgId: null,
};

let activeBackendValue: ResolvedActiveBackend = LOCAL_BACKEND;

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => activeBackendValue,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { mockGetHome, mockSearchSubdirectories } = vi.hoisted(() => ({
  mockGetHome: vi.fn(),
  mockSearchSubdirectories: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", async () => {
  const actual = await vi.importActual<
    typeof import("@openhands/typescript-client/clients")
  >("@openhands/typescript-client/clients");
  return {
    ...actual,
    FileClient: vi.fn(function FileClientMock() {
      return {
        searchSubdirectories: mockSearchSubdirectories,
        getHome: mockGetHome,
      };
    }),
  };
});

function renderModal(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <FolderBrowserModal isOpen onClose={vi.fn()} onAdd={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("FolderBrowserModal — backend-switch regression (issue #200)", () => {
  beforeEach(() => {
    mockGetHome.mockReset();
    mockSearchSubdirectories.mockReset();
    mockSearchSubdirectories.mockResolvedValue({
      items: [],
      next_page_id: null,
    });
    activeBackendValue = LOCAL_BACKEND;
  });

  it("re-seeds the breadcrumb to the new backend's home directory after the active backend changes", async () => {
    mockGetHome.mockImplementation(async () => {
      if (activeBackendValue.backend.id === LOCAL_BACKEND.backend.id) {
        return { home: LOCAL_HOME };
      }
      if (activeBackendValue.backend.id === REMOTE_BACKEND.backend.id) {
        return { home: REMOTE_HOME };
      }
      return { home: "/" };
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { rerender } = renderModal(queryClient);

    await waitFor(() =>
      expect(
        screen.getByTestId("folder-browser-current-path"),
      ).toHaveTextContent(LOCAL_HOME),
    );

    activeBackendValue = REMOTE_BACKEND;
    rerender(
      <QueryClientProvider client={queryClient}>
        <FolderBrowserModal isOpen onClose={vi.fn()} onAdd={vi.fn()} />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("folder-browser-current-path"),
      ).toHaveTextContent(REMOTE_HOME),
    );
    expect(
      screen.getByTestId("folder-browser-current-path"),
    ).not.toHaveTextContent(LOCAL_HOME);
  });
});
