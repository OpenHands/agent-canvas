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

  it("forces first-run onboarding in locked mode even when a stale Local backend reports a configured LLM", async () => {
    // Critical regression for PR #1389 review: in locked-to-Cloud mode the
    // ready-backend fast-path must NOT skip onboarding for a reachable
    // stale Local backend that happens to report a configured LLM. The
    // fast-path may only fire when the active backend IS the locked Cloud
    // host; otherwise the user must be routed through the Cloud login /
    // replacement flow. Here the agent-server (stale Local backend) reports
    // `llm_api_key_is_set: true` and a configured model, which previously
    // made `isBackendLlmReady` true and bypassed onboarding entirely.
    vi.stubEnv("VITE_LOCK_TO_CLOUD", "https://app.all-hands.dev");
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_SESSION_API_KEY__;
    window.localStorage.setItem(
      "openhands-backends",
      JSON.stringify([
        {
          id: "user-added-local",
          name: "My agent-server",
          host: "http://127.0.0.1:8000",
          apiKey: "stale-key",
          kind: "local",
        },
      ]),
    );
    window.localStorage.setItem(
      "openhands-active-backend",
      JSON.stringify({ backendId: "user-added-local", orgId: null }),
    );
    __resetActiveStoreForTests();
    server.use(
      http.get("*/api/settings", () =>
        HttpResponse.json({
          llm_api_key_is_set: true,
          agent_settings: {
            llm: { model: "openai/gpt-5.5", api_key: "stored" },
          },
        }),
      ),
      http.get("*/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.28.1" }),
      ),
    );

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
    // The ready-backend fast-path must NOT have persisted completion.
    expect(
      window.localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY),
    ).toBeNull();
  });

  it("forces first-run onboarding in locked mode when a Cloud backend points at a different host with a configured LLM", async () => {
    // Companion to the stale-Local test: a Cloud backend on a *different*
    // host than the locked Cloud host must also be forced through
    // onboarding, even if it reports a configured LLM. `kind === "cloud"`
    // alone is not enough — the host must match the locked host.
    vi.stubEnv("VITE_LOCK_TO_CLOUD", "https://app.all-hands.dev");
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_SESSION_API_KEY__;
    const otherCloud = {
      id: "other-cloud",
      name: "Other Cloud",
      host: "https://other-cloud.example.com",
      apiKey: "other-token",
      kind: "cloud",
    };
    window.localStorage.setItem(
      "openhands-backends",
      JSON.stringify([otherCloud]),
    );
    window.localStorage.setItem(
      "openhands-active-backend",
      JSON.stringify({ backendId: otherCloud.id, orgId: null }),
    );
    __resetActiveStoreForTests();
    server.use(
      http.get("*/api/settings", () =>
        HttpResponse.json({
          llm_api_key_set: true,
          agent_settings: {
            llm: { model: "openai/gpt-5.5" },
          },
        }),
      ),
      http.get("*/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.28.1" }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(
        screen.getByTestId("first-run-onboarding-screen"),
      ).toBeInTheDocument();
    });
    expect(await screen.findByTestId("onboarding-modal")).toBeInTheDocument();
    expect(
      window.localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY),
    ).toBeNull();
  });

  it("shows first-run onboarding when locked to Cloud even if onboarding was previously completed", async () => {
    // Reproduces hieptl's report on PR #1389: the user had previously
    // completed onboarding in a non-locked session (so the
    // `openhands-onboarded` localStorage flag is set), then relaunched the
    // static server with --lock-to-cloud. The stale completion flag used to
    // suppress first-run onboarding, so the app fell through to the Manage
    // Backends recovery modal ("Add Backend") instead of going straight to
    // Cloud login. In locked-to-Cloud mode the completion flag must not
    // bypass onboarding when the active backend is not a connected Cloud
    // backend.
    vi.stubEnv("VITE_LOCK_TO_CLOUD", "https://app.all-hands.dev");
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_SESSION_API_KEY__;
    window.localStorage.clear();
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
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

    await waitFor(
      () => {
        expect(
          screen.getByTestId("agent-server-onboarding-screen"),
        ).toBeInTheDocument();
      },
      { timeout: 8000 },
    );

    // The onboarding placeholder now hosts the Manage Backends modal
    // directly so the user can edit/add a backend immediately. The
    // modal additionally probes /server_info per registered backend
    // for its status dot + version label, so the request count is
    // bounded but greater than the single config probe.
    await waitFor(
      () => {
        expect(screen.getByTestId("manage-backends-modal")).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
    expect(serverInfoRequests).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId("app-outlet")).not.toBeInTheDocument();
  });

  it("retries the bootstrap config probe on a transient failure then renders the app", async () => {
    let serverInfoRequests = 0;

    server.use(
      http.get("*/server_info", () => {
        serverInfoRequests += 1;
        if (serverInfoRequests === 1) {
          return HttpResponse.error();
        }
        return HttpResponse.json({
          uptime: 0,
          idle_time: 0,
          version: "1.28.1",
        });
      }),
    );

    renderApp(["/"]);

    await waitFor(
      () => {
        expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(serverInfoRequests).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByTestId("agent-server-onboarding-screen"),
    ).not.toBeInTheDocument();
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

  it("does not mark onboarding complete for the launcher-seeded default-local backend even when the agent-server reports a configured LLM", async () => {
    // Regression for mock-llm-onboarding-regressions.spec.ts:16
    // ("keeps the modal open on backdrop click and Escape") and
    // mock-llm-auth-modes.spec.ts:57 ("reaches the onboarding modal
    // without pre-seeded localStorage"). The shared mock-LLM
    // agent-server retains a previously-configured LLM across browser
    // sessions, so a genuinely fresh browser install (launcher-seeded
    // default-local backend, no `openhands-onboarded` flag) must NOT
    // have onboarding auto-marked complete by the returning-user
    // fast-path. The settings-based LLM-ready signal is unreliable for
    // the launcher-seeded default backend and must be suppressed there.
    vi.stubEnv("VITE_BACKEND_BASE_URL", "http://127.0.0.1:8000");
    vi.stubEnv("VITE_SESSION_API_KEY", "test-session-key");
    // The launcher-seeded default-local backend (id
    // SEEDED_DEFAULT_BACKEND_ID) is created from these env stubs by
    // readStoredBackends().
    __resetActiveStoreForTests();
    server.use(
      http.get("*/api/settings", () =>
        HttpResponse.json({
          llm_api_key_is_set: true,
          agent_settings: {
            llm: { model: "openai/gpt-5.5", api_key: "stored" },
          },
        }),
      ),
      http.get("*/server_info", () =>
        HttpResponse.json({ uptime: 0, idle_time: 0, version: "1.28.1" }),
      ),
    );

    renderApp(["/"]);

    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });

    // The returning-user fast-path must NOT have persisted completion.
    expect(
      window.localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY),
    ).toBeNull();
  });

  it("hides first-run onboarding immediately after Cloud login completes in locked-to-Cloud mode (no flicker)", async () => {
    // Regression for hieptl's flicker report on PR #1389: after Cloud
    // login succeeds in locked-to-Cloud mode, the onboarding modal's
    // onClose marks onboarding complete. The root first-run gate must
    // honor that completion IMMEDIATELY — without waiting for the Cloud
    // settings probe to confirm a configured LLM — so the first-run
    // screen disappears and the routed app renders, rather than the
    // modal flickering back via OnboardingHost. This test simulates the
    // post-login state (active locked Cloud backend + completion flag
    // set by the modal's onClose) with the Cloud settings probe
    // reporting NO configured LLM, which is exactly the window where
    // the old gate (`!isActiveLockedCloudBackend || !backendLlmReady`)
    // kept the first-run screen mounted and caused the reopen.
    vi.stubEnv("VITE_LOCK_TO_CLOUD", "https://app.all-hands.dev");
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_SESSION_API_KEY__;
    const lockedCloud = {
      id: "locked-cloud",
      name: "OpenHands Cloud",
      host: "https://app.all-hands.dev",
      apiKey: "cloud-session-key",
      kind: "cloud",
    };
    window.localStorage.setItem(
      "openhands-backends",
      JSON.stringify([lockedCloud]),
    );
    window.localStorage.setItem(
      "openhands-active-backend",
      JSON.stringify({ backendId: lockedCloud.id, orgId: null }),
    );
    // The onboarding modal's onClose (markCompleted) sets this right
    // after Cloud login succeeds — before the Cloud settings probe
    // resolves. Seed it to reproduce the post-login moment.
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "1");
    __resetActiveStoreForTests();
    // Cloud settings probe reports no configured LLM. This is the
    // critical condition: the old gate treated `!backendLlmReady` as
    // "keep showing first-run onboarding" even though the user had
    // just finished Cloud login, so the modal reappeared.
    server.use(
      http.get("https://app.all-hands.dev/api/v1/settings", () =>
        HttpResponse.json({ llm_api_key_set: false }),
      ),
      http.get("https://app.all-hands.dev/api/keys/current", () =>
        HttpResponse.json({ org_id: "org-1" }),
      ),
    );

    renderApp(["/"]);

    // The first-run onboarding screen must NOT be mounted (no reopen),
    // and the routed app must render instead.
    await waitFor(() => {
      expect(screen.getByTestId("app-outlet")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("first-run-onboarding-screen"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-modal")).not.toBeInTheDocument();
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
