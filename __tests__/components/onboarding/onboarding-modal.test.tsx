import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetActiveStoreForTests } from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { OnboardingModal } from "#/components/features/onboarding/onboarding-modal";
import { NavigationProvider } from "#/context/navigation-context";

// Both the backend status badge in the embedded edit form and the
// step-1 health probe ride on `useBackendsHealth`, which itself
// resolves through these two clients.
vi.mock("@openhands/typescript-client/clients", () => ({
  ServerClient: vi.fn(function ServerClientMock() {
    return {
      getServerInfo: vi.fn().mockResolvedValue({ version: "1.18.0" }),
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
// step is mounted.
vi.mock("#/routes/llm-settings", () => ({
  LlmSettingsScreen: () => (
    <div data-testid="llm-settings-screen-stub">llm settings</div>
  ),
}));

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

    // Active slide sits at offset 0; later slides are translated 100%
    // per index away to the right and absolute-positioned so they
    // don't bleed into the modal box.
    expect(screen.getByTestId("onboarding-slide-0")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("onboarding-slide-0").style.transform).toBe(
      "translateX(0%)",
    );
    expect(screen.getByTestId("onboarding-slide-1").style.transform).toBe(
      "translateX(100%)",
    );
    expect(screen.getByTestId("onboarding-slide-2").style.transform).toBe(
      "translateX(200%)",
    );
    expect(screen.getByTestId("onboarding-slide-3").style.transform).toBe(
      "translateX(300%)",
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

  it("advances each step via the per-step Next button and reframes slide offsets", async () => {
    renderModal();
    const user = userEvent.setup();

    // Step 0 → 1
    await user.click(screen.getByTestId("onboarding-agent-next"));
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-modal")).toHaveAttribute(
        "data-current-step",
        "1",
      ),
    );
    expect(screen.getByTestId("onboarding-slide-1")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("onboarding-slide-0").style.transform).toBe(
      "translateX(-100%)",
    );
    expect(screen.getByTestId("onboarding-slide-1").style.transform).toBe(
      "translateX(0%)",
    );
    expect(screen.getByTestId("onboarding-slide-2").style.transform).toBe(
      "translateX(100%)",
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
    expect(screen.getByTestId("onboarding-slide-3").style.transform).toBe(
      "translateX(0%)",
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
    // the progress bar and Skip control above it never scroll away.
    const scrollArea = screen.getByTestId("onboarding-scroll-area");
    const rail = screen.getByTestId("onboarding-slide-rail");
    expect(scrollArea.contains(rail)).toBe(true);
  });

  it("keeps the LLM step heading and Back/Next outside the scrollable settings body", async () => {
    // Arrange: render the modal and walk through to the LLM step.
    renderModal();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("onboarding-agent-next"));
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-backend-next")).not.toBeDisabled(),
    );
    await user.click(screen.getByTestId("onboarding-backend-next"));

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

  it("pre-fills the say-hello input with the default greeting on step 3", async () => {
    renderModal();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("onboarding-agent-next"));
    await waitFor(() =>
      expect(screen.getByTestId("onboarding-backend-next")).not.toBeDisabled(),
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
});
