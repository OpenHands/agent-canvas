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

const llmSettingsScreenMock = vi.hoisted(() => vi.fn());

// Both the backend status badge in the embedded edit form and the
// step-1 health probe ride on `useBackendsHealth`, which resolves
// server metadata through `ServerClient`.
vi.mock("@openhands/typescript-client/clients", () => ({
  ServerClient: vi.fn(function ServerClientMock() {
    return {
      getServerInfo: vi.fn().mockResolvedValue({ version: "1.18.0" }),
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
  __resetActiveStoreForTests();
  llmSettingsScreenMock.mockClear();
  // ChooseAgentStep's Next button now persists the selection via
  // saveSettings before advancing. Stub it so the rest of the flow
  // (which these tests focus on) isn't gated on a real HTTP call.
  vi.spyOn(SettingsService, "saveSettings").mockResolvedValue(true);
});
afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
});

describe("OnboardingModal", () => {
  it("starts on the Choose Agent step with each slide offset by its index", () => {
    renderModal();

    expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
      "data-current-step",
      "0",
    );
    expect(
      screen.getByTestId("onboarding-step-choose-agent"),
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

  it("pre-fills the LLM step with the OpenHands provider", () => {
    renderModal();

    expect(llmSettingsScreenMock).toHaveBeenCalledTimes(1);
    expect(llmSettingsScreenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValueOverrides: {
          "llm.model": "openhands/claude-opus-4-5-20251101",
        },
      }),
    );
  });

  it("advances each step via the per-step Next button and reframes slide offsets", async () => {
    renderModal();
    const user = userEvent.setup();

    // Step 0 → 1. ChooseAgentStep now does an async save before
    // advancing, so the modal can take a beat to flip steps while
    // SayHello/CheckBackend queries are still settling on the four
    // mounted slides. Bump the default 1s waitFor timeout.
    await user.click(screen.getByTestId("onboarding-agent-next"));
    await waitFor(
      () =>
        expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
          "data-current-step",
          "1",
        ),
      { timeout: 3000 },
    );
    expect(screen.getByTestId("onboarding-slide-1")).toHaveAttribute(
      "data-active",
      "true",
    );

    // Once the backend health probe resolves, step 1's Next is enabled.
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-backend-next")).not.toBeDisabled(),
    );
    await user.click(screen.getByTestId("onboarding-backend-next"));
    expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
      "data-current-step",
      "2",
    );
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
    await user.click(screen.getByTestId("onboarding-agent-next"));
    await waitFor(
      () =>
        expect(
          screen.getByTestId("onboarding-backend-next"),
        ).not.toBeDisabled(),
      { timeout: 3000 },
    );
    await user.click(screen.getByTestId("onboarding-backend-next"));
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

  it("skips the LLM-setup step when the user picks an ACP agent", async () => {
    renderModal();
    const user = userEvent.setup();

    // Pick Claude Code, then advance from Choose Agent → Check Backend.
    await user.click(screen.getByTestId("onboarding-agent-option-claude-code"));
    await user.click(screen.getByTestId("onboarding-agent-next"));
    await waitFor(
      () =>
        expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
          "data-current-step",
          "1",
        ),
      { timeout: 3000 },
    );

    // Advancing again should jump straight to Say Hello (index 3) and
    // bypass the LLM form — ACP agents own their own LLM via the
    // subprocess.
    await waitFor(
      () =>
        expect(
          screen.getByTestId("onboarding-backend-next"),
        ).not.toBeDisabled(),
      { timeout: 3000 },
    );
    await user.click(screen.getByTestId("onboarding-backend-next"));

    await waitFor(
      () =>
        expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
          "data-current-step",
          "3",
        ),
      { timeout: 3000 },
    );
    // All four slides remain mounted (the rail just translates them);
    // the assertion that the LLM step was skipped is that slide 3 (Say
    // Hello) is the active one immediately after the backend step,
    // *not* slide 2 (LLM).
    expect(screen.getByTestId("onboarding-slide-2")).toHaveAttribute(
      "data-active",
      "false",
    );
    expect(screen.getByTestId("onboarding-slide-3")).toHaveAttribute(
      "data-active",
      "true",
    );

    // Progress bar reflects the *visited* step count, not the slide
    // index — 3 segments total (not 4), and segment 2 is current (not
    // segment 3, which would imply LLM was completed). Without this
    // mapping, picking an ACP agent makes the bar show segment 2 as
    // "completed" despite the user never visiting it.
    expect(
      screen.queryByTestId("onboarding-progress-step-3"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("onboarding-progress-step-2")).toHaveAttribute(
      "data-state",
      "current",
    );
    expect(screen.getByTestId("onboarding-progress-step-1")).toHaveAttribute(
      "data-state",
      "completed",
    );
  });

  it("pre-fills the say-hello input with the default greeting on step 3", async () => {
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("onboarding-agent-next"));
    await waitFor(
      () =>
        expect(
          screen.getByTestId("onboarding-backend-next"),
        ).not.toBeDisabled(),
      { timeout: 3000 },
    );
    await user.click(screen.getByTestId("onboarding-backend-next"));
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

    await user.click(screen.getByTestId("onboarding-agent-next"));
    await waitFor(
      () =>
        expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
          "data-current-step",
          "1",
        ),
      { timeout: 3000 },
    );
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-backend-next")).not.toBeDisabled(),
    );
    await user.click(screen.getByTestId("onboarding-backend-next"));
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
