import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { server } from "#/mocks/node";
import {
  clearTelemetryData,
  getPostHogInstance,
  initializePostHogClient,
  setTelemetryConsent,
  trackInstall,
  trackEvent,
} from "#/services/telemetry";

describe("Canvas telemetry delivery", () => {
  beforeEach(async () => {
    await clearTelemetryData();
  });

  afterEach(async () => {
    await clearTelemetryData();
  });

  it("uses one client identity for install and consented funnel events", async () => {
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
    await trackEvent("canvas_delivery_test", { source: "vitest" });

    await waitFor(() => expect(requestBodies.length).toBeGreaterThanOrEqual(2));
    const install = requestBodies.find(
      (body) => body.event === "canvas_install",
    );
    const funnel = requestBodies.find(
      (body) => body.event === "canvas_delivery_test",
    );
    expect(install).toBeDefined();
    expect(funnel).toBeDefined();
    expect(
      (funnel?.properties as Record<string, unknown>).distinct_id,
    ).toBe((install?.properties as Record<string, unknown>).distinct_id);
  });
});
