import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import App, { links } from "#/root";
import { server } from "#/mocks/node";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { ONBOARDING_COMPLETED_STORAGE_KEY } from "#/components/features/onboarding/use-onboarding-completion";

const TRANSLATIONS: Record<string, string> = {
  BACKEND$MANAGE_TITLE: "Manage backends",
  BACKEND$MANAGE_EMPTY: "No backends yet.",
  BACKEND$ADD: "+ Add Backend",
  BACKEND$LOG_BACK_IN: "Log back in",
  BACKEND$LOGGED_OUT: "Logged out",
  BACKEND$KIND_LOCAL: "Local",
  BACKEND$KIND_CLOUD: "Cloud",
  BACKEND$EDIT: "Edit",
  BACKEND$REMOVE: "Remove",
  HOME$DONE: "Done",
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

vi.mock("#/components/features/onboarding/onboarding-modal", () => ({
  OnboardingModal: () => (
    <div data-testid="onboarding-modal">
      <div data-testid="onboarding-step-check-backend" />
    </div>
  ),
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
    vi.unstubAllEnvs();
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_AUTH_REQUIRED__;
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_LOCK_TO_CLOUD__;
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_SESSION_API_KEY__ = "test-session-key";
    __resetActiveStoreForTests();
  });

  it("shows first-run onboarding before the auth gate when public mode has no backend key", async () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "true");
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_SESSION_API_KEY__;
    window.localStorage.clear();
    __resetActiveStoreForTests();

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("first-run-onboarding-screen"),
      ).toBeInTheDocument();
    });
    expect(await screen.findByTestId("onboarding-modal")).toBeInTheDocument();
    expect(
      await screen.findByTestId("onboarding-step-check-backend"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("api-key-entry-screen"),
    ).not.toBeInTheDocument();
  });

  it("shows first-run onboarding before the recovery modal when locked to Cloud with no backend", async () => {
    vi.stubEnv("VITE_LOCK_TO_CLOUD", "https://app.all-hands.dev");
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_SESSION_API_KEY__;
    window.localStorage.clear();
    __resetActiveStoreForTests();

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("first-run-onboarding-screen"),
      ).toBeInTheDocument();
    });
    expect(await screen.findByTestId("onboarding-modal")).toBeInTheDocument();
    expect(
      screen.queryByTestId("agent-server-onboarding-screen"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("manage-backends-modal"),
    ).not.toBeInTheDocument();
  });

  it("shows first-run onboarding when locked to Cloud even if a session API key is baked in", async () => {
    // Reproduces Hiep's report on PR #1389: a pre-built bundle with a baked-in
    // VITE_SESSION_API_KEY plus --lock-to-cloud used to seed a disconnected
    // Local backend, which skipped onboarding and landed on the Manage Backends
    // recovery modal. Locked mode must not seed a Local backend, so onboarding
    // still owns the first-run Cloud login.
    vi.stubEnv("VITE_LOCK_TO_CLOUD", "https://app.all-hands.dev");
    vi.stubEnv("VITE_SESSION_API_KEY", "baked-session-key");
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_SESSION_API_KEY__ = "baked-session-key";
    window.localStorage.clear();
    __resetActiveStoreForTests();

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("first-run-onboarding-screen"),
      ).toBeInTheDocument();
    });
    expect(await screen.findByTestId("onboarding-modal")).toBeInTheDocument();
    expect(
      screen.queryByTestId("agent-server-onboarding-screen"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("manage-backends-modal"),
    ).not.toBeInTheDocument();
    // No Local backend should have been seeded into the registry.
    expect(window.localStorage.getItem("openhands-backends")).toBeNull();
  });

  it("shows first-run onboarding when locked to Cloud with a stale persisted Local backend", async () => {
    // A Local backend persisted from a previous non-locked session must not
    // bypass onboarding once the deployment is locked to Cloud.
    vi.stubEnv("VITE_LOCK_TO_CLOUD", "https://app.all-hands.dev");
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_SESSION_API_KEY__;
    window.localStorage.setItem(
      "openhands-backends",
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: "http://127.0.0.1:8000",
          apiKey: "stale-key",
          kind: "local",
        },
      ]),
    );
    window.localStorage.setItem(
      "openhands-active-backend",
      JSON.stringify({ backendId: "default-local", orgId: null }),
    );
    __resetActiveStoreForTests();

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("first-run-onboarding-screen"),
      ).toBeInTheDocument();
    });
    expect(await screen.findByTestId("onboarding-modal")).toBeInTheDocument();
    expect(
      screen.queryByTestId("manage-backends-modal"),
    ).not.toBeInTheDocument();
  });

  it("shows the auth gate after onboarding was already completed", async () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "true");
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_SESSION_API_KEY__;
    window.localStorage.clear();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    __resetActiveStoreForTests();

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("api-key-entry-screen")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument();
  });

  it("shows the manage-backends modal when the connected server reports an old version", async () => {
    server.use(
      http.get("/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.27.1" }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("agent-server-onboarding-screen"),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId("manage-backends-modal")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
  });

  it("shows the manage-backends modal when the server omits a version field", async () => {
    server.use(
      http.get("/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0 }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("agent-server-onboarding-screen"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
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

  it("shows the manage-backends recovery modal when the active cloud backend is logged out", async () => {
    const cloudBackend = {
      id: "cloud-expired",
      name: "OpenHands Cloud",
      host: "https://app.all-hands.dev",
      apiKey: "expired-token",
      kind: "cloud",
    };
    window.localStorage.setItem(
      "openhands-backends",
      JSON.stringify([cloudBackend]),
    );
    window.localStorage.setItem(
      "openhands-active-backend",
      JSON.stringify({ backendId: cloudBackend.id, orgId: null }),
    );
    window.sessionStorage.setItem(
      "openhands-active-backend",
      JSON.stringify({ backendId: cloudBackend.id, orgId: null }),
    );
    __resetActiveStoreForTests();
    server.use(
      http.get("https://app.all-hands.dev/api/keys/current", () =>
        HttpResponse.json({ detail: "NoCredentialsError" }, { status: 401 }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("agent-server-onboarding-screen"),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("manage-backends-modal")).toBeInTheDocument();
    expect(screen.getByText("Logged out")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Log back in" }),
    ).toBeInTheDocument();
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
