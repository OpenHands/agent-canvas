import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "#/mocks/node";
import {
  clearTelemetryData,
  getPostHogInstance,
  initializePostHogClient,
  setTelemetryConsent,
  trackInstall,
} from "#/services/telemetry";
import { useTracking } from "#/hooks/use-tracking";

// Reproduce the backend-transition window from the live regression: typed
// React events must still reach the shared telemetry boundary while the newly
// selected backend's settings query is unresolved.
vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => ({ data: undefined }),
}));

describe("Canvas telemetry delivery", () => {
  beforeEach(async () => {
    await clearTelemetryData();
  });

  afterEach(async () => {
    await clearTelemetryData();
  });

  it("keeps install and typed backend-transition events on one identity", async () => {
    const requestBodies: Record<string, unknown>[] = [];
    server.use(
      http.post("https://z.openhands.dev/*", async ({ request }) => {
        const body = Buffer.from(await request.arrayBuffer());
        const compression = new URL(request.url).searchParams.get(
          "compression",
        );
        const decoded =
          compression === "gzip-js"
            ? gunzipSync(body).toString("utf8")
            : body.toString("utf8");
        requestBodies.push(JSON.parse(decoded) as Record<string, unknown>);
        return HttpResponse.json(null, { status: 200 });
      }),
    );

    const client = await initializePostHogClient();
    expect(client).not.toBeNull();
    client!.set_config({ request_batching: false, disable_compression: true });
    await trackInstall();
    expect(await getPostHogInstance()).toBe(client);

    const { default: sharedPosthog } = await import("posthog-js");
    expect(client).toBe(sharedPosthog);

    await setTelemetryConsent("granted");
    const { result } = renderHook(() => useTracking());
    result.current.trackBackendAdded({
      backendKind: "cloud",
      connectionMethod: "cloud_login",
      isOpenhandsCloud: true,
      isCustomHost: false,
      hasApiKey: true,
      source: "onboarding",
    });
    result.current.trackConversationCreated({
      conversationId: "task-live-regression",
      taskId: "live-regression",
      hasRepository: false,
      hasWorkspace: false,
      hasInitialQuery: true,
      hasParentConversation: false,
      entryPoint: "onboarding_say_hello",
    });

    await waitFor(() => {
      expect(requestBodies.some((body) => body.event === "backend_added")).toBe(
        true,
      );
      expect(
        requestBodies.some((body) => body.event === "conversation_created"),
      ).toBe(true);
    });
    const install = requestBodies.find(
      (body) => body.event === "canvas_install",
    );
    const backendAdded = requestBodies.find(
      (body) => body.event === "backend_added",
    );
    const conversationCreated = requestBodies.find(
      (body) => body.event === "conversation_created",
    );
    expect(install).toBeDefined();
    expect(backendAdded).toBeDefined();
    expect(conversationCreated).toBeDefined();
    const installDistinctId = (install?.properties as Record<string, unknown>)
      .distinct_id;
    expect(
      (backendAdded?.properties as Record<string, unknown>).distinct_id,
    ).toBe(installDistinctId);
    expect(
      (conversationCreated?.properties as Record<string, unknown>).distinct_id,
    ).toBe(installDistinctId);
  });
});
