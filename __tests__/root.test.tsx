import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import App from "#/root";
import { server } from "#/mocks/node";

const TRANSLATIONS: Record<string, string> = {
  "SETTINGS$AGENT_SERVER_ONBOARDING_EYEBROW": "Get started",
  "SETTINGS$AGENT_SERVER_ONBOARDING_TITLE": "Connect to your agent server",
  "SETTINGS$AGENT_SERVER_ONBOARDING_DESCRIPTION":
    "Agent Canvas needs an agent server before it can load conversations, tools, and settings. Start or choose a compatible server, then connect it here.",
  "SETTINGS$AGENT_SERVER_UNAVAILABLE_STATUS_TITLE":
    "We couldn't reach the configured server",
  "SETTINGS$AGENT_SERVER_UNAVAILABLE_STATUS_MESSAGE":
    "Check the URL, confirm the server is running, and try again. You can also point Agent Canvas at a different deployment.",
  "SETTINGS$AGENT_SERVER_OPEN_SETTINGS_PAGE": "Open full settings page",
  "SETTINGS$AGENT_SERVER_SETUP_GUIDE_HINT":
    "If you need help starting or upgrading the server, see the",
  "SETTINGS$AGENT_SERVER_SETUP_GUIDE_LINK": "setup instructions",
  "SETTINGS$AGENT_SERVER_DETAILS_LABEL": "Details: {{details}}",
  "SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_TITLE": "Connection details",
  "SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_DESCRIPTION":
    "Paste the agent server URL and optional session API key that Agent Canvas should use.",
  "SETTINGS$AGENT_SERVER_URL": "Agent server URL",
  "SETTINGS$AGENT_SERVER_URL_PLACEHOLDER": "https://agent.example.com",
  "SETTINGS$AGENT_SERVER_API_KEY": "Session API key",
  "SETTINGS$AGENT_SERVER_API_KEY_PLACEHOLDER":
    "Enter the X-Session-API-Key value",
  "SETTINGS$AGENT_SERVER_BROWSER_ONLY_NOTE":
    "Saved only in this browser. Deployment defaults stay available until you override them here.",
  "SETTINGS$AGENT_SERVER_RETRY_CONNECTION": "Retry connection",
  "SETTINGS$SAVE_AND_RECONNECT": "Save and reconnect",
  "COMMON$OPTIONAL": "Optional",
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
        {children}
      </QueryClientProvider>
    ),
  });

describe("App root agent-server availability guard", () => {
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

  it("shows the onboarding flow when the backend is unreachable", async () => {
    let serverInfoRequests = 0;

    server.use(
      http.get("/server_info", () => {
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

    expect(
      screen.getByRole("heading", { name: /connect to your agent server/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /setup instructions/i }),
    ).toHaveAttribute("href", "https://github.com/OpenHands/agent-canvas");
    expect(serverInfoRequests).toBe(1);
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
