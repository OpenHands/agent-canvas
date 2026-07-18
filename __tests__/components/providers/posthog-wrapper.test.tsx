import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PostHogWrapper } from "#/components/providers/posthog-wrapper";

const mocks = vi.hoisted(() => ({
  client: { capture: vi.fn() },
  configureBootstrap: vi.fn(),
  initializeClient: vi.fn(),
  provider: vi.fn(),
}));

vi.mock("#/services/telemetry", () => ({
  configurePostHogBootstrap: mocks.configureBootstrap,
  initializePostHogClient: mocks.initializeClient,
}));

vi.mock("posthog-js/react", () => ({
  PostHogProvider: (props: Record<string, unknown>) => {
    mocks.provider(props);
    return props.children;
  },
}));

const renderWrapper = (children: ReactNode) =>
  render(<PostHogWrapper>{children}</PostHogWrapper>);

describe("PostHogWrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.initializeClient.mockResolvedValue(mocks.client);
    window.location.hash = "";
    sessionStorage.clear();
  });

  it("shares the telemetry-owned client and bootstraps IDs from the URL", async () => {
    window.location.hash = "distinct_id=user-123&session_id=session-456";

    renderWrapper(<div data-testid="child" />);

    expect(mocks.configureBootstrap).toHaveBeenCalledWith({
      distinctID: "user-123",
      sessionID: "session-456",
    });
    expect(window.location.hash).toBe("");
    await waitFor(() =>
      expect(mocks.provider).toHaveBeenCalledWith(
        expect.objectContaining({ client: mocks.client }),
      ),
    );
  });

  it("restores bootstrap IDs after an OAuth redirect", async () => {
    sessionStorage.setItem(
      "posthog_bootstrap",
      JSON.stringify({ distinctID: "user-123", sessionID: "session-456" }),
    );

    renderWrapper(<div data-testid="child" />);

    expect(mocks.configureBootstrap).toHaveBeenCalledWith({
      distinctID: "user-123",
      sessionID: "session-456",
    });
    expect(sessionStorage.getItem("posthog_bootstrap")).toBeNull();
    await waitFor(() => expect(mocks.provider).toHaveBeenCalled());
  });

  it("keeps rendering children if PostHog cannot initialize", async () => {
    mocks.initializeClient.mockRejectedValueOnce(new Error("unavailable"));

    renderWrapper(<div data-testid="child" />);

    expect(await screen.findByTestId("child")).toBeInTheDocument();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
});
