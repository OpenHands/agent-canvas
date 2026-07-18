import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { server } from "#/mocks/node";
import {
  clearTelemetryData,
  getPostHogInstance,
  setTelemetryConsent,
  trackEvent,
} from "#/services/telemetry";

describe("Canvas telemetry delivery", () => {
  afterEach(async () => {
    await clearTelemetryData();
  });

  it("delivers a consented event through the real named PostHog client", async () => {
    const requestBodies: string[] = [];
    server.use(
      http.post("https://z.openhands.dev/*", async ({ request }) => {
        const body = Buffer.from(await request.arrayBuffer());
        const compression = new URL(request.url).searchParams.get(
          "compression",
        );
        requestBodies.push(
          compression === "gzip-js"
            ? gunzipSync(body).toString("utf8")
            : body.toString("utf8"),
        );
        return HttpResponse.json(null, { status: 200 });
      }),
    );

    await setTelemetryConsent("granted");
    const client = await getPostHogInstance();
    expect(client).not.toBeNull();

    // Reproduce the host-app lifecycle that previously broke Canvas events:
    // its default client is initialized and opted out after Canvas opts in.
    const { default: hostPosthog } = await import("posthog-js");
    hostPosthog.init(client!.config.token, {
      api_host: "https://z.openhands.dev",
      advanced_disable_flags: true,
      autocapture: false,
      capture_pageview: false,
    });
    hostPosthog.opt_out_capturing();
    expect(hostPosthog.has_opted_out_capturing()).toBe(true);
    expect(client!.has_opted_out_capturing()).toBe(false);

    // Send this assertion event immediately and without compression so the
    // test validates the SDK's actual HTTP delivery rather than a capture mock.
    client!.set_config({ request_batching: false, disable_compression: true });
    await trackEvent("canvas_delivery_test", { source: "vitest" });

    await waitFor(() =>
      expect(
        requestBodies.some((body) => body.includes("canvas_delivery_test")),
      ).toBe(true),
    );
  });
});
