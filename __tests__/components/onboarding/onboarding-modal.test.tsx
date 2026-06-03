import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { OnboardingModal } from "#/components/features/onboarding/onboarding-modal";
import { NavigationProvider } from "#/context/navigation-context";
import SettingsService from "#/api/settings-service/settings-service.api";
import { SecretsService } from "#/api/secrets-service";

const llmSettingsScreenMock = vi.hoisted(() => vi.fn());
const getServerInfoMock = vi.hoisted(() => vi.fn());

// Both the backend status badge in the embedded edit form and the
// step-1 health probe ride on `useBackendsHealth`, which resolves
// server metadata through `ServerClient`.
vi.mock("@openhands/typescript-client/clients", () => ({
  ServerClient: vi.fn(function ServerClientMock(options?: { host?: string }) {
    return {
      getServerInfo: vi.fn(() => getServerInfoMock(options)),
    };
  }),
  // The always-mounted LLM slide initializes settings hooks even though
  // `LlmSettingsScreen` is stubbed, so provide the minimal client it needs.
  SettingsClient: vi.fn(function SettingsClientMock() {
    return {
      getSettings: vi.fn().mockResolvedValue({}),
    };
  }),
}));

vi.mock("#/api/cloud/organization-service.api", () => ({
  getCurrentCloudApiKey: vi.fn().mockResolvedValue({
    orgId: null,
    isLegacyKey: true,
  }),
}));

// The LLM step renders the full `LlmSettingsScreen`, which transitively
// pulls in agent-server config + schema queries we don't need to
// exercise here. Stub it to a marker so we can still verify the LLM
// step is mounted and inspect the onboarding defaults passed to it.
vi.mock("#/routes/llm-settings", async () => {
  const React = await import("react");

  return {
    LlmSettingsScreen: (props: Record<string, unknown>) => {
      llmSettingsScreenMock(props);
      return React.createElement(
        "div",
        { "data-testid": "llm-settings-screen-stub" },
        "llm settings",
      );
    },
  };
});

vi.mock(
  "#/components/features/automations/recommended-automations-launcher",
  () => ({
    RecommendedAutomationsLauncher: ({
      onLaunched,
    }: {
      onLaunched?: () => void;
    }) => (
      <div data-testid="recommended-automations-launcher-stub">
        <button type="button" onClick={onLaunched}>
          launch recommended automation
        </button>
      </div>
    ),
  }),
);

vi.mock("#/hooks/use-is-creating-conversation", () => ({
  useIsCreatingConversation: () => false,
}));

vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
  }),
}));

// The ACP credentials slide runs a login-detection probe (calls
// GET /api/acp/auth-status). Stub it here so the modal routing tests don't hit
// the network; the probe itself is covered in use-acp-auth-status.test.tsx.
vi.mock("#/hooks/query/use-acp-auth-status", () => ({
  useAcpAuthStatus: () => ({
    status: "unknown",
    isChecking: false,
    isSupported: false,
  }),
}));

async function completeBackendStep(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(
    () =>
      expect(screen.getByTestId("onboarding-backend-next")).not.toBeDisabled(),
    { timeout: 3000 },
  );
  await user.click(screen.getByTestId("onboarding-backend-next"));
  await waitFor(
    () =>
      expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
        "data-current-step",
        "1",
      ),
    { timeout: 3000 },
  );
}

async function completeAgentStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("onboarding-agent-next"));
  await waitFor(
    () =>
      expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
        "data-current-step",
        "2",
      ),
    { timeout: 3000 },
  );
}

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const navigationValue = {
    currentPath: "/",
    conversationId: null,
    isNavigating: false,
    navigate: vi.fn(),
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>
        <NavigationProvider value={navigationValue}>
          <OnboardingModal onClose={onClose} />
        </NavigationProvider>
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubEnv("VITE_BACKEND_BASE_URL", "http://localhost:9000");
  vi.stubEnv("VITE_SESSION_API_KEY", "session-key");
  __resetActiveStoreForTests();
  // Clear accumulated spy/mock call history so per-test assertions (the
  // ACP secret-write checks and the LLM-defaults mock) don't see calls
  // leaked from a prior test. Covers `llmSettingsScreenMock` too.
  vi.clearAllMocks();
  getServerInfoMock.mockReset();
  getServerInfoMock.mockImplementation((options?: { host?: string }) => {
    if (options?.host?.startsWith("https://127.0.0.1:8000")) {
      return Promise.reject(new Error("Failed to fetch"));
    }
    return Promise.resolve({ version: "1.18.0" });
  });
  // ChooseAgentStep's Next button now persists the selection via
  // saveSettings before advancing. Stub it so the rest of the flow
  // (which these tests focus on) isn't gated on a real HTTP call.
  vi.spyOn(SettingsService, "saveSettings").mockResolvedValue(true);
  // The ACP secrets step lists existing secrets to flag "already saved"
  // fields. Stub the fetch so it doesn't reach a real client (none is
  // wired up in this test) and the field placeholders stay in the
  // not-yet-saved state.
  vi.spyOn(SecretsService, "getSecrets").mockResolvedValue([]);
  vi.spyOn(SecretsService, "createSecret").mockResolvedValue();
});
afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  __resetActiveStoreForTests();
});

describe("OnboardingModal", () => {
  it("starts on the backend setup step with each slide offset by its index", () => {
    renderModal();

    expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
      "data-current-step",
      "0",
    );
    expect(
      screen.getByTestId("onboarding-step-check-backend"),
    ).toBeInTheDocument();

    expect(screen.getByTestId("onboarding-slide-0")).toHaveAttribute(
      "data-active",
      "true",
    );

    // Progress bar reflects step 1 of 4.
    expect(screen.getByTestId("onboarding-progress-step-0")).toHaveAttribute(
      "data-state",
      "current",
    );
    expect(screen.getByTestId("onboarding-progress-step-1")).toHaveAttribute(
      "data-state",
      "upcoming",
    );
  });

  it("shows a connection error when saving an unreachable backend", async () => {
    renderModal();
    const user = userEvent.setup();

    await user.clear(screen.getByTestId("onboarding-backend-host"));
    await user.type(
      screen.getByTestId("onboarding-backend-host"),
      "https://127.0.0.1:8000",
    );
    await user.clear(screen.getByTestId("onboarding-backend-api-key"));
    await user.type(
      screen.getByTestId("onboarding-backend-api-key"),
      "session-key",
    );
    await user.click(screen.getByTestId("onboarding-backend-submit"));

    expect(
      await screen.findByTestId("onboarding-backend-error"),
    ).toHaveTextContent("BACKEND$CONNECTION_TEST_FAILED");
    expect(screen.getByTestId("onboarding-backend-error")).toHaveTextContent(
      "Failed to fetch",
    );
  });

  it("pre-fills the LLM step with the Anthropic provider's Claude Opus model", () => {
    renderModal();

    expect(llmSettingsScreenMock).toHaveBeenCalledTimes(1);
    expect(llmSettingsScreenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValueOverrides: {
          "llm.model": "anthropic/claude-opus-4-8",
        },
      }),
    );
  });

  it("advances each step via the per-step Next button and reframes slide offsets", async () => {
    renderModal();
    const user = userEvent.setup();

    // Step 0 → 1. Once the backend health probe resolves, step 0's Next is enabled.
    await completeBackendStep(user);
    expect(screen.getByTestId("onboarding-slide-1")).toHaveAttribute(
      "data-active",
      "true",
    );

    // Step 1 → 2. ChooseAgentStep does an async save before advancing.
    await completeAgentStep(user);
    expect(screen.getByTestId("onboarding-slide-2")).toHaveAttribute(
      "data-active",
      "true",
    );

    // Step 2 → 3
    await user.click(screen.getByTestId("onboarding-llm-next"));
    expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
      "data-current-step",
      "3",
    );
    expect(screen.getByTestId("onboarding-slide-3")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("Skip immediately closes the modal", async () => {
    const onClose = vi.fn();
    renderModal(onClose);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("onboarding-skip"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when the user clicks outside it or presses Escape", async () => {
    // Arrange
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();

    // Act: errant interactions outside the modal box — click the dark
    // backdrop overlay, then press Escape.
    const backdrop = screen.getByRole("dialog")
      .firstElementChild as HTMLElement;
    await user.click(backdrop);
    await user.keyboard("{Escape}");

    // Assert: neither dismisses the flow nor marks onboarding completed
    // (https://github.com/OpenHands/agent-canvas/issues/1085); the modal
    // only closes via explicit actions (Skip / launch).
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("onboarding-modal")).toBeInTheDocument();
  });

  it("wraps the slide rail in a dedicated scroll region so the modal chrome stays put", () => {
    // Arrange + act: render the modal once.
    renderModal();

    // Assert: the slide rail lives inside the scroll region. Long step
    // content overflows this region rather than the modal itself, so
    // the progress bar above it never scrolls away. Skip sits below the modal.
    const scrollArea = screen.getByTestId("onboarding-scroll-area");
    const rail = screen.getByTestId("onboarding-slide-rail");
    expect(scrollArea.contains(rail)).toBe(true);
  });

  it("keeps the LLM step heading and Back/Next outside the scrollable settings body", async () => {
    // Arrange: render the modal and walk through to the LLM step.
    renderModal();
    const user = userEvent.setup();
    await completeBackendStep(user);
    await completeAgentStep(user);
    // Wait for the LLM slide to become the active one before querying
    // by role — otherwise the heading is `aria-hidden` from inside a
    // not-yet-active slide and getByRole filters it out.
    await waitFor(
      () =>
        expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
          "data-current-step",
          "2",
        ),
      { timeout: 3000 },
    );

    // Act: locate the step's scrollable settings wrapper and the chrome
    // around it that the user expects to remain visible.
    const step = screen.getByTestId("onboarding-step-setup-llm");
    const settings = within(step).getByTestId("onboarding-llm-settings");
    const heading = within(step).getByRole("heading", { level: 2 });
    const back = within(step).getByTestId("onboarding-llm-back");
    const next = within(step).getByTestId("onboarding-llm-next");

    // Assert: heading and footer buttons are siblings of the settings
    // body, not descendants. Anything moved inside the settings wrapper
    // would scroll out of view on the All tab — this is the invariant
    // the fix relies on.
    expect(settings.contains(heading)).toBe(false);
    expect(settings.contains(back)).toBe(false);
    expect(settings.contains(next)).toBe(false);
  });

  it("shows slide 2 with Gemini's credential fields", async () => {
    renderModal();
    const user = userEvent.setup();

    // Pick Gemini CLI: its key/base-URL come from the SDK registry like the
    // other providers, so the slide shows the GEMINI_API_KEY field.
    await completeBackendStep(user);
    await user.click(screen.getByTestId("onboarding-agent-option-gemini-cli"));
    await completeAgentStep(user);

    // Lands on slide 2 (the ACP step) — not jumped past to Say Hello.
    await waitFor(
      () =>
        expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
          "data-current-step",
          "2",
        ),
      { timeout: 3000 },
    );
    expect(screen.getByTestId("onboarding-slide-2")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(
      screen.getByTestId("onboarding-step-setup-acp-secrets"),
    ).toBeInTheDocument();
    // Gemini exposes credential fields (GEMINI_API_KEY), derived from the SDK
    // registry like Claude Code / Codex.
    expect(
      screen.getByTestId("onboarding-acp-secret-GEMINI_API_KEY"),
    ).toBeInTheDocument();

    // The flow keeps all four progress segments (nothing is skipped).
    expect(
      screen.getByTestId("onboarding-progress-step-3"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-progress-step-2")).toHaveAttribute(
      "data-state",
      "current",
    );
  });

  it("shows the ACP credentials step on slide 2 for Claude Code and saves entered keys as secrets", async () => {
    renderModal();
    const user = userEvent.setup();

    // Pick Claude Code → Check Backend.
    await completeBackendStep(user);
    await user.click(screen.getByTestId("onboarding-agent-option-claude-code"));
    await completeAgentStep(user);

    // Slide 2 is the ACP credentials step (not skipped), so the flow keeps
    // all 4 progress segments and slide 2 — not Say Hello — is now active.
    await waitFor(
      () =>
        expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
          "data-current-step",
          "2",
        ),
      { timeout: 3000 },
    );
    expect(screen.getByTestId("onboarding-slide-2")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(
      screen.getByTestId("onboarding-step-setup-acp-secrets"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("onboarding-progress-step-3"),
    ).toBeInTheDocument();

    // Both Anthropic credentials are offered; the optional base URL too.
    const apiKeyField = screen.getByTestId(
      "onboarding-acp-secret-ANTHROPIC_API_KEY",
    );
    expect(apiKeyField).toBeInTheDocument();
    expect(
      screen.getByTestId("onboarding-acp-secret-ANTHROPIC_BASE_URL"),
    ).toBeInTheDocument();

    // Fill the API key and advance: the value is upserted as a global
    // secret of the same name, then the flow moves on to Say Hello.
    await user.type(apiKeyField, "sk-ant-test");
    await user.click(screen.getByTestId("onboarding-acp-secrets-next"));

    await waitFor(() => {
      expect(SecretsService.createSecret).toHaveBeenCalledWith(
        "ANTHROPIC_API_KEY",
        "sk-ant-test",
        undefined,
      );
    });
    await waitFor(
      () =>
        expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
          "data-current-step",
          "3",
        ),
      { timeout: 3000 },
    );
  });

  it("skips the secret write when the ACP credentials step is left blank", async () => {
    renderModal();
    const user = userEvent.setup();

    await completeBackendStep(user);
    await user.click(screen.getByTestId("onboarding-agent-option-codex"));
    await completeAgentStep(user);
    await waitFor(
      () =>
        expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
          "data-current-step",
          "2",
        ),
      { timeout: 3000 },
    );

    // Leaving every field empty is a deliberate skip — no secret is
    // written, and the user still advances to Say Hello.
    await user.click(screen.getByTestId("onboarding-acp-secrets-next"));
    await waitFor(
      () =>
        expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
          "data-current-step",
          "3",
        ),
      { timeout: 3000 },
    );
    expect(SecretsService.createSecret).not.toHaveBeenCalled();
  });

  it("pre-fills the say-hello input with the default greeting on step 3", async () => {
    renderModal();
    const user = userEvent.setup();

    await completeBackendStep(user);
    await completeAgentStep(user);
    await user.click(screen.getByTestId("onboarding-llm-next"));

    const helloInput = screen.getByTestId(
      "onboarding-hello-input",
    ) as HTMLInputElement;
    // Translation is mocked to return the key; the default-message
    // hook still pre-fills with whatever t() returns, which here is
    // the I18nKey itself. The contract under test is that the input
    // is non-empty and matches the resolved default message.
    expect(helloInput.value).toBe("ONBOARDING$HELLO_DEFAULT_MESSAGE");
  });

  it("shows recommended automations below the Say Hello input", async () => {
    const onClose = vi.fn();
    renderModal(onClose);
    const user = userEvent.setup();

    await completeBackendStep(user);
    await completeAgentStep(user);
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-slide-2")).toHaveAttribute(
        "data-active",
        "true",
      ),
    );
    await user.click(screen.getByTestId("onboarding-llm-next"));
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-slide-3")).toHaveAttribute(
        "data-active",
        "true",
      ),
    );

    const helloInput = screen.getByTestId("onboarding-hello-input");
    const recommendations = screen.getByTestId(
      "onboarding-recommended-automations",
    );
    expect(
      helloInput.compareDocumentPosition(recommendations) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(recommendations).getByTestId(
        "recommended-automations-launcher-stub",
      ),
    ).toBeInTheDocument();

    expect(recommendations.closest("form")).toBeNull();

    await user.click(
      within(recommendations).getByRole("button", {
        name: "launch recommended automation",
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
