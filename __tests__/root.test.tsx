import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { MINIMUM_SUPPORTED_AGENT_SERVER_VERSION } from "#/api/agent-server-compatibility";
import App from "#/root";
import { server } from "#/mocks/node";

const TRANSLATIONS: Record<string, string> = {
  "SETTINGS$AGENT_SERVER_UPGRADE_TITLE": "Update your agent server",
  "SETTINGS$AGENT_SERVER_UPGRADE_EYEBROW": "Upgrade required",
  "SETTINGS$AGENT_SERVER_UPGRADE_DESCRIPTION":
    "This GUI can only connect to agent server version {{minimumVersion}} or newer. Upgrade the server or point this GUI at a newer deployment.",
  "SETTINGS$AGENT_SERVER_UPGRADE_STATUS_TITLE":
    "The connected server is too old",
  "SETTINGS$AGENT_SERVER_UPGRADE_STATUS_MESSAGE":
    "Upgrade this agent server to version {{minimumVersion}} or newer, or switch to another deployment from the connection form.",
  "SETTINGS$AGENT_SERVER_ONBOARDING_EYEBROW": "Get started",
  "SETTINGS$AGENT_SERVER_ONBOARDING_TITLE": "Connect to your agent server",
  "SETTINGS$AGENT_SERVER_ONBOARDING_DESCRIPTION":
    "This GUI needs an agent server before it can load conversations, tools, and settings. Start or choose a compatible server, then connect it here.",
  "SETTINGS$AGENT_SERVER_UNAVAILABLE_STATUS_TITLE":
    "We couldn't reach the configured server",
  "SETTINGS$AGENT_SERVER_UNAVAILABLE_STATUS_MESSAGE":
    "Check the URL, confirm the server is running, and try again. You can also point this GUI at a different deployment.",
  "SETTINGS$AGENT_SERVER_UNKNOWN_VERSION_STATUS_TITLE":
    "We couldn't confirm the server version",
  "SETTINGS$AGENT_SERVER_UNKNOWN_VERSION_STATUS_MESSAGE":
    "We reached something at that URL, but it did not identify itself as an agent server version {{minimumVersion}} or newer. Double-check the URL or upgrade the server.",
  "SETTINGS$AGENT_SERVER_OPEN_SETTINGS_PAGE": "Open full settings page",
  "SETTINGS$AGENT_SERVER_SETUP_GUIDE_HINT":
    "If you need help starting or upgrading the server, see the",
  "SETTINGS$AGENT_SERVER_SETUP_GUIDE_LINK": "setup instructions",
  "SETTINGS$AGENT_SERVER_DETECTED_VERSION": "Detected version: {{version}}",
  "SETTINGS$AGENT_SERVER_DETAILS_LABEL": "Details: {{details}}",
  "SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_TITLE": "Connection details",
  "SETTINGS$AGENT_SERVER_CONNECTION_DETAILS_DESCRIPTION":
    "Paste the agent server URL and optional session API key that this GUI should use.",
  "SETTINGS$AGENT_SERVER_URL": "Agent server URL",
  "SETTINGS$AGENT_SERVER_URL_PLACEHOLDER": "https://agent.example.com",
  "SETTINGS$AGENT_SERVER_API_KEY": "Session API key",
  "SETTINGS$AGENT_SERVER_API_KEY_PLACEHOLDER":
    "Enter the X-Session-API-Key value",
  "SETTINGS$AGENT_SERVER_BROWSER_ONLY_NOTE":
    "Saved only in this browser. Deployment defaults stay available until you override them here.",
  "SETTINGS$AGENT_SERVER_RETRY_CONNECTION": "Retry connection",
  "SETTINGS$SAVE_AND_RECONNECT": "Save and reconnect",
  "SETTINGS$AGENT_SERVER_STEP_LABEL": "Step {{step}}",
  "SETTINGS$AGENT_SERVER_STEP_UPGRADE_TITLE": "Upgrade to {{minimumVersion}}+",
  "SETTINGS$AGENT_SERVER_STEP_UPGRADE_DESCRIPTION":
    "Update the connected agent server so it exposes the APIs this GUI expects.",
  "SETTINGS$AGENT_SERVER_STEP_URL_TITLE": "Enter its URL",
  "SETTINGS$AGENT_SERVER_STEP_URL_DESCRIPTION":
    "Use the address where this browser can reach the server, such as https://agent.example.com.",
  "SETTINGS$AGENT_SERVER_STEP_RECONNECT_TITLE": "Reconnect the GUI",
  "SETTINGS$AGENT_SERVER_STEP_RECONNECT_DESCRIPTION":
    "Retry once the server is upgraded, or point this browser at a newer deployment.",
  "SETTINGS$AGENT_SERVER_STEP_START_TITLE": "Start a compatible server",
  "SETTINGS$AGENT_SERVER_STEP_START_DESCRIPTION":
    "Run an agent server version {{minimumVersion}} or newer locally, or use a remote deployment you already manage.",
  "SETTINGS$AGENT_SERVER_STEP_SAVE_TITLE": "Save and reconnect",
  "SETTINGS$AGENT_SERVER_STEP_SAVE_DESCRIPTION":
    "We'll store your choice in this browser and reconnect right away.",
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
      {
        Component: () => (
          <div data-testid="agent-server-settings-screen">
            agent server settings
          </div>
        ),
        path: "/settings/agent-server",
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

describe("App root compatibility guard", () => {
  it("shows a friendlier upgrade flow when the connected agent server is too old", async () => {
    server.use(
      http.get("/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.16.1" }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("agent-server-upgrade-screen")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("heading", { name: /update your agent server/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/detected version: 1\.16\.1/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        new RegExp(`${MINIMUM_SUPPORTED_AGENT_SERVER_VERSION} or newer`),
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/connection blocked/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
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
    ).toHaveAttribute("href", "https://github.com/OpenHands/agent-server-gui");
    expect(screen.queryByText(/step 1/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /open full settings page/i }),
    ).not.toBeInTheDocument();
    expect(serverInfoRequests).toBe(1);
    expect(screen.queryByText(/connection blocked/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
  });

  it("shows the onboarding flow when the server version cannot be determined", async () => {
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

    expect(
      screen.getByText(/we couldn't confirm the server version/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        new RegExp(`${MINIMUM_SUPPORTED_AGENT_SERVER_VERSION} or newer`),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(/unsupported agent server version/i),
    ).not.toBeInTheDocument();
  });

  it("renders the routed page when the agent server is compatible", async () => {
    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("agent-server-onboarding-screen"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-server-upgrade-screen")).not.toBeInTheDocument();
  });

  it("still allows the agent server settings route when the backend is unreachable", async () => {
    server.use(http.get("/server_info", () => HttpResponse.error()));

    renderApp(["/settings/agent-server"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("agent-server-settings-screen"),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("agent-server-onboarding-screen"),
    ).not.toBeInTheDocument();
  });
});
