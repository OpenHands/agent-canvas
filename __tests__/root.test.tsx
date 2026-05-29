import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import App from "#/root";
import { server } from "#/mocks/node";
import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";

const ORIGINAL_LOCATION = window.location;
const APP_HOME_PATH = "/";
const BACKEND_SETTINGS_PATH = "/settings/backend";

const TRANSLATIONS: Record<string, string> = {
  COMMON$OPTIONAL: "Optional",
  SETTINGS$AGENT_SERVER_ONBOARDING_EYEBROW: "Get started",
  SETTINGS$AGENT_SERVER_ONBOARDING_TITLE: "Connect to your agent server",
  SETTINGS$AGENT_SERVER_ONBOARDING_DESCRIPTION:
    "Agent Canvas needs an agent server before it can load conversations, tools, and settings.",
  SETTINGS$AGENT_SERVER_MISSING_STATUS_TITLE: "No backend is configured",
  SETTINGS$AGENT_SERVER_MISSING_STATUS_MESSAGE:
    "Enter the agent server URL and session API key to connect this browser.",
  SETTINGS$AGENT_SERVER_AUTH_STATUS_TITLE: "Backend authentication failed",
  SETTINGS$AGENT_SERVER_AUTH_STATUS_MESSAGE:
    "The configured server rejected the session API key.",
  SETTINGS$AGENT_SERVER_UNAVAILABLE_STATUS_TITLE:
    "We couldn't reach the configured server",
  SETTINGS$AGENT_SERVER_UNAVAILABLE_STATUS_MESSAGE:
    "Check the URL, confirm the server is running, and try again.",
  SETTINGS$AGENT_SERVER_DETAILS_LABEL: "Details: {{details}}",
  SETTINGS$AGENT_SERVER_RETRY_CONNECTION: "Retry connection",
  BACKEND$MANAGE_TITLE: "Manage Backends",
  BACKEND$MANAGE_EMPTY: "No backends configured.",
  BACKEND$ADD: "Add backend",
  BACKEND$EDIT: "Edit",
  BACKEND$REMOVE: "Remove",
  BACKEND$KIND_LOCAL: "Local",
  BACKEND$KIND_CLOUD: "Cloud",
  BACKEND$VERSION_LABEL: "v{{version}}",
  BACKEND$EDIT_TITLE: "Edit backend",
  BACKEND$NAME_LABEL: "Name",
  BACKEND$HOST_LABEL: "Host",
  BACKEND$KEY_LABEL: "API key",
  BACKEND$SAVE: "Save",
  BUTTON$CANCEL: "Cancel",
  ONBOARDING$BACKEND_STATUS_CONNECTED: "Connected",
  ONBOARDING$BACKEND_STATUS_DISCONNECTED: "Disconnected",
  ONBOARDING$BACKEND_STATUS_CHECKING: "Checking",
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
      {
        Component: () => <Navigate to={APP_HOME_PATH} replace />,
        path: BACKEND_SETTINGS_PATH,
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

function stubConfiguredBackend(baseUrl = "http://agent.example.com") {
  vi.stubEnv("VITE_BACKEND_BASE_URL", baseUrl);
  __resetActiveStoreForTests();
}

describe("App root agent-server availability guard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: ORIGINAL_LOCATION,
    });
  });

  it("renders the routed page even when the connected server reports an old version", async () => {
    stubConfiguredBackend();
    server.use(
      http.get("*/server_info", () =>
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
    stubConfiguredBackend();
    server.use(
      http.get("*/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0 }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });
  });

  it("shows the backend settings page without probing the Vite origin when no backend is configured", async () => {
    let serverInfoRequests = 0;

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

    expect(screen.getByTestId("manage-backends-panel")).toBeInTheDocument();
    expect(screen.getByText("No backend is configured")).toBeInTheDocument();
    expect(screen.getByText("No backends configured.")).toBeInTheDocument();
    expect(screen.queryByText(/^Details:/)).not.toBeInTheDocument();
    expect(serverInfoRequests).toBe(0);
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
  });

  it("does not dump HTML response bodies into backend error details", async () => {
    stubConfiguredBackend();
    server.use(
      http.get(
        "*/server_info",
        () =>
          new HttpResponse(
            '<!DOCTYPE html><html lang="en"><body><h1>404 Not Found</h1></body></html>',
            {
              status: 404,
              headers: { "Content-Type": "text/html" },
            },
          ),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("agent-server-onboarding-screen"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText("We couldn't reach the configured server"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/DOCTYPE html/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /The server returned an HTML page instead of an agent-server API response\./,
      ),
    ).toBeInTheDocument();
  });

  it("redirects to the backend settings page when the backend rejects the session key", async () => {
    stubConfiguredBackend();
    server.use(
      http.get("*/server_info", () => new HttpResponse(null, { status: 401 })),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("agent-server-onboarding-screen"),
      ).toBeInTheDocument();
    });

    expect(screen.getByTestId("manage-backends-panel")).toBeInTheDocument();
    expect(
      screen.getByText("Backend authentication failed"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
  });

  it("redirects to the backend settings page when protected API auth fails", async () => {
    stubConfiguredBackend();
    server.use(
      http.get("*/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.24.0" }),
      ),
      http.get("*/api/settings", () => new HttpResponse(null, { status: 401 })),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("agent-server-onboarding-screen"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText("Backend authentication failed"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
  });

  it("adds backend connection details from the startup fallback", async () => {
    const user = userEvent.setup();
    const remoteOrigin = "http://remote-agent.example.com:18000";
    const assign = vi.fn();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: Object.assign(new URL("http://localhost/"), { assign }),
    });
    __resetActiveStoreForTests();

    server.use(
      http.get("*/server_info", ({ request }) => {
        const origin = new URL(request.url).origin;

        if (origin === remoteOrigin) {
          return HttpResponse.json({
            uptime: 0,
            idle_time: 0,
            version: "1.18.0",
          });
        }

        return HttpResponse.error();
      }),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("agent-server-onboarding-screen"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("manage-backends-add"));
    await user.type(await screen.findByTestId("add-backend-name"), "Remote");
    const hostInput = await screen.findByTestId("add-backend-host");
    await user.type(hostInput, remoteOrigin);
    await user.click(screen.getByTestId("add-backend-submit"));

    expect(
      window.localStorage.getItem("openhands-backends"),
    ).toContain(remoteOrigin);
    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it("renders the routed page when the agent server is reachable", async () => {
    stubConfiguredBackend();
    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("agent-server-onboarding-screen"),
    ).not.toBeInTheDocument();
  });
});
