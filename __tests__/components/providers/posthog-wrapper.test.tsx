import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PostHogWrapper } from "#/components/providers/posthog-wrapper";

const mocks = vi.hoisted(() => ({
  client: { capture: vi.fn() },
  configureBootstrap: vi.fn(),
  configureTelemetry: vi.fn(),
  initializeClient: vi.fn(),
  provider: vi.fn(),
}));

vi.mock("#/services/telemetry", () => ({
  configurePostHogBootstrap: mocks.configureBootstrap,
  configureTelemetry: mocks.configureTelemetry,
  initializePostHogClient: mocks.initializeClient,
}));

vi.mock("posthog-js/react", () => ({
  PostHogProvider: (props: Record<string, unknown>) => {
    mocks.provider(props);
    return props.children;
  },
}));

const runtimeConfig = {
  apiKey: "phc_embedded",
  apiHost: "https://events.example.com",
  uiHost: "https://posthog.example.com",
};

const renderWrapper = (children: ReactNode) =>
  render(<PostHogWrapper config={runtimeConfig}>{children}</PostHogWrapper>);

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
    expect(mocks.configureTelemetry).toHaveBeenCalledWith(runtimeConfig);
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
    expect(mocks.provider).not.toHaveBeenCalledWith(
      expect.objectContaining({ client: mocks.client }),
    );
  });

  it("uses an inert provider and never initializes when analytics are disabled", () => {
    render(
      <PostHogWrapper config={false}>
        <div data-testid="disabled-child" />
      </PostHogWrapper>,
    );

    expect(screen.getByTestId("disabled-child")).toBeInTheDocument();
    expect(mocks.configureTelemetry).toHaveBeenCalledWith(false);
    expect(mocks.initializeClient).not.toHaveBeenCalled();
    expect(mocks.provider).toHaveBeenCalled();
  });
});
