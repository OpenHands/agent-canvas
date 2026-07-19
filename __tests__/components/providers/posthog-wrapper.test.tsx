import { type ReactNode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { PostHog } from "posthog-js";
import { usePostHog } from "posthog-js/react";
import { PostHogWrapper } from "#/components/providers/posthog-wrapper";
import * as telemetry from "#/services/telemetry";

const client = { capture: vi.fn() } as unknown as PostHog;

function ClientProbe({ onClient }: { onClient: (client: PostHog) => void }) {
  const providedClient = usePostHog();
  useEffect(() => {
    onClient(providedClient);
  }, [onClient, providedClient]);
  return null;
}

const runtimeConfig = {
  apiKey: "phc_embedded",
  apiHost: "https://events.example.com",
  uiHost: "https://posthog.example.com",
};

const renderWrapper = (children: ReactNode) => {
  const providedClients: PostHog[] = [];
  const onClient = (providedClient: PostHog) => {
    providedClients.push(providedClient);
  };
  const result = render(
    <PostHogWrapper config={runtimeConfig}>
      <ClientProbe onClient={onClient} />
      {children}
    </PostHogWrapper>,
  );
  return {
    ...result,
    getProvidedClient: () => providedClients.at(-1),
  };
};

describe("PostHogWrapper", () => {
  let configureBootstrapMock: ReturnType<typeof vi.spyOn>;
  let configureTelemetryMock: ReturnType<typeof vi.spyOn>;
  let initializeClientMock: ReturnType<typeof vi.spyOn>;
  let trackEventMock: ReturnType<typeof vi.spyOn>;
  let trackExceptionMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    configureBootstrapMock = vi
      .spyOn(telemetry, "configurePostHogBootstrap")
      .mockImplementation(() => undefined);
    configureTelemetryMock = vi
      .spyOn(telemetry, "configureTelemetry")
      .mockImplementation(() => undefined);
    initializeClientMock = vi
      .spyOn(telemetry, "initializePostHogClient")
      .mockResolvedValue(client);
    trackEventMock = vi
      .spyOn(telemetry, "trackEvent")
      .mockResolvedValue(undefined);
    trackExceptionMock = vi
      .spyOn(telemetry, "trackException")
      .mockResolvedValue(undefined);
    window.location.hash = "";
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shares the telemetry-owned client and bootstraps IDs from the URL", async () => {
    window.location.hash = "distinct_id=user-123&session_id=session-456";

    const { getProvidedClient } = renderWrapper(<div data-testid="child" />);

    expect(configureBootstrapMock).toHaveBeenCalledWith({
      distinctID: "user-123",
      sessionID: "session-456",
    });
    expect(configureTelemetryMock).toHaveBeenCalledWith(runtimeConfig);
    expect(window.location.hash).toBe("");
    await waitFor(() => expect(getProvidedClient()).toBe(client));
  });

  it("restores bootstrap IDs after an OAuth redirect", async () => {
    sessionStorage.setItem(
      "posthog_bootstrap",
      JSON.stringify({ distinctID: "user-123", sessionID: "session-456" }),
    );

    const { getProvidedClient } = renderWrapper(<div data-testid="child" />);

    expect(configureBootstrapMock).toHaveBeenCalledWith({
      distinctID: "user-123",
      sessionID: "session-456",
    });
    expect(sessionStorage.getItem("posthog_bootstrap")).toBeNull();
    await waitFor(() => expect(getProvidedClient()).toBe(client));
  });

  it("keeps rendering children if PostHog cannot initialize", async () => {
    initializeClientMock.mockRejectedValueOnce(new Error("unavailable"));

    const { getProvidedClient } = renderWrapper(<div data-testid="child" />);

    expect(await screen.findByTestId("child")).toBeInTheDocument();
    expect(getProvidedClient()).not.toBe(client);
  });

  it("forwards captures while the shared client is initializing", () => {
    initializeClientMock.mockReturnValueOnce(new Promise(() => {}));

    const { getProvidedClient } = renderWrapper(<div data-testid="child" />);

    const deferredClient = getProvidedClient() as unknown as {
      capture: (event: string, properties: Record<string, unknown>) => void;
      captureException: (
        error: Error,
        properties: Record<string, unknown>,
      ) => void;
    };
    const error = new Error("early failure");
    deferredClient.capture("early_event", { source: "startup" });
    deferredClient.captureException(error, { source: "startup" });

    expect(trackEventMock).toHaveBeenCalledWith("early_event", {
      source: "startup",
    });
    expect(trackExceptionMock).toHaveBeenCalledWith(error, {
      source: "startup",
    });
  });

  it("uses an inert provider and never initializes when analytics are disabled", () => {
    render(
      <PostHogWrapper config={false}>
        <div data-testid="disabled-child" />
      </PostHogWrapper>,
    );

    expect(screen.getByTestId("disabled-child")).toBeInTheDocument();
    expect(configureTelemetryMock).toHaveBeenCalledWith(false);
    expect(initializeClientMock).not.toHaveBeenCalled();
  });
});
