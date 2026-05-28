import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import App, { links } from "#/root";
import { server } from "#/mocks/node";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

const TRANSLATIONS: Record<string, string> = {
  "BACKEND$MANAGE_TITLE": "Manage backends",
  "BACKEND$MANAGE_EMPTY": "No backends yet.",
  "BACKEND$ADD": "+ Add Backend",
  "BACKEND$KIND_LOCAL": "Local",
  "BACKEND$KIND_CLOUD": "Cloud",
  "BACKEND$EDIT": "Edit",
  "BACKEND$REMOVE": "Remove",
  "HOME$DONE": "Done",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      let value = TRANSLATIONS[key] ?? key;
      for (const [optionKey, optionValue] of Object.entries(options ?? {})) {
        value = value.replaceAll(`{{${optionKey}}}`, String(optionValue));
      }
      return value;
    },
  }),
}));

const RouterStub = createRoutesStub([
  {
    Component: App,
    path: "/",
    children: [
      {
        Component: () => <div data-testid="app-outlet">app outlet</div>,
        path: "/",
      },
    ],
  },
]);

const renderApp = (initialEntries: string[] = ["/"]) =>
  render(<RouterStub initialEntries={initialEntries} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        <ActiveBackendProvider>{children}</ActiveBackendProvider>
      </QueryClientProvider>
    ),
  });

describe("App root agent-server availability guard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
  });


  it("renders the routed page even when the connected server reports an old version", async () => {
    server.use(
      http.get("/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.0.0" }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("agent-server-onboarding-screen"),
    ).not.toBeInTheDocument();
  });

  it("renders the routed page when the server omits a version field", async () => {
    server.use(
      http.get("/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0 }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });
  });

  it("shows the manage-backends modal when the backend is unreachable", async () => {
    let serverInfoRequests = 0;

    // Use "*" prefix to match both relative paths and absolute URLs (e.g.,
    // http://127.0.0.1:8000/server_info) when VITE_BACKEND_BASE_URL is configured.
    server.use(
      http.get("*/server_info", () => {
        serverInfoRequests += 1;
        return HttpResponse.error();
      }),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("agent-server-onboarding-screen"),
      ).toBeInTheDocument();
    });

    // The onboarding placeholder now hosts the Manage Backends modal
    // directly so the user can edit/add a backend immediately. The
    // modal additionally probes /server_info per registered backend
    // for its status dot + version label, so the request count is
    // bounded but greater than the single config probe.
    await waitFor(() => {
      expect(screen.getByTestId("manage-backends-modal")).toBeInTheDocument();
    });
    expect(serverInfoRequests).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
  });

  it("renders the routed page when the agent server is reachable", async () => {
    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("agent-server-onboarding-screen"),
    ).not.toBeInTheDocument();
  });
});

describe("App root document links", () => {
  it("declares the SVG favicon used by the browser tab", () => {
    // Act
    const documentLinks = links();

    // Assert
    expect(documentLinks).toContainEqual({
      rel: "icon",
      type: "image/svg+xml",
      href: "/favicon.svg",
    });
  });
});
