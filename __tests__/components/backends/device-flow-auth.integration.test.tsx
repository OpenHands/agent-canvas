import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceFlowAuth } from "#/components/features/backends/device-flow-auth";
import { server } from "#/mocks/node";

function makePopup() {
  return {
    closed: false,
    close: vi.fn(),
    opener: {},
    location: {
      href: "",
    },
  } as unknown as Window & {
    close: ReturnType<typeof vi.fn>;
    opener: unknown;
    location: { href: string };
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DeviceFlowAuth integration", () => {
  it("completes login through the real hook and device-flow client", async () => {
    const proxyRequests: Array<{ path?: unknown; host?: unknown }> = [];
    server.use(
      http.post("*/api/cloud-proxy", async ({ request }) => {
        const body = (await request.json()) as {
          path?: string;
          host?: string;
        };
        proxyRequests.push(body);

        if (body.path === "/oauth/device/authorize") {
          return HttpResponse.json({
            device_code: "device-code",
            user_code: "ABC",
            verification_uri: "https://app.all-hands.dev/device",
            verification_uri_complete:
              "https://app.all-hands.dev/device?user_code=ABC",
            expires_in: 600,
            interval: 1,
          });
        }

        if (body.path === "/oauth/device/token") {
          return HttpResponse.json({
            access_token: "cloud-api-key",
            token_type: "Bearer",
          });
        }

        return HttpResponse.json({ error: "unexpected path" }, { status: 500 });
      }),
    );

    const popup = makePopup();
    vi.spyOn(window, "open").mockReturnValue(popup);
    const onSuccess = vi.fn();

    render(
      <DeviceFlowAuth
        host="https://app.all-hands.dev"
        onSuccess={onSuccess}
        testIdRoot="cloud"
      />,
    );

    await userEvent.click(screen.getByTestId("cloud-login-button"));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("cloud-api-key");
    });
    expect(proxyRequests).toEqual([
      expect.objectContaining({
        host: "https://app.all-hands.dev",
        path: "/oauth/device/authorize",
      }),
      expect.objectContaining({
        host: "https://app.all-hands.dev",
        path: "/oauth/device/token",
      }),
    ]);
    expect(popup.close).toHaveBeenCalled();
  });

  it("shows authorization start errors from the real hook", async () => {
    server.use(
      http.post("*/api/cloud-proxy", async ({ request }) => {
        const body = (await request.json()) as { path?: string };
        if (body.path === "/oauth/device/authorize") {
          return HttpResponse.json({ error: "forbidden" }, { status: 403 });
        }
        return HttpResponse.json({ error: "unexpected path" }, { status: 500 });
      }),
    );

    const popup = makePopup();
    vi.spyOn(window, "open").mockReturnValue(popup);

    render(
      <DeviceFlowAuth
        host="https://app.all-hands.dev"
        onSuccess={vi.fn()}
        testIdRoot="cloud"
      />,
    );

    await userEvent.click(screen.getByTestId("cloud-login-button"));

    expect(await screen.findByTestId("cloud-auth-error")).toHaveTextContent(
      "Failed to start device flow: Server returned 403",
    );
    expect(popup.close).toHaveBeenCalled();
  });

  it("shows token polling errors from the real hook", async () => {
    server.use(
      http.post("*/api/cloud-proxy", async ({ request }) => {
        const body = (await request.json()) as { path?: string };

        if (body.path === "/oauth/device/authorize") {
          return HttpResponse.json({
            device_code: "device-code",
            user_code: "ABC",
            verification_uri: "https://app.all-hands.dev/device",
            verification_uri_complete:
              "https://app.all-hands.dev/device?user_code=ABC",
            expires_in: 600,
            interval: 1,
          });
        }

        if (body.path === "/oauth/device/token") {
          return HttpResponse.json({ error: "access_denied" }, { status: 400 });
        }

        return HttpResponse.json({ error: "unexpected path" }, { status: 500 });
      }),
    );

    const popup = makePopup();
    vi.spyOn(window, "open").mockReturnValue(popup);

    render(
      <DeviceFlowAuth
        host="https://app.all-hands.dev"
        onSuccess={vi.fn()}
        testIdRoot="cloud"
      />,
    );

    await userEvent.click(screen.getByTestId("cloud-login-button"));

    expect(await screen.findByTestId("cloud-auth-error")).toHaveTextContent(
      "Authorization request was denied.",
    );
    expect(popup.close).toHaveBeenCalled();
  });

  it("rejects unsafe verification URLs returned by the real device flow", async () => {
    server.use(
      http.post("*/api/cloud-proxy", async ({ request }) => {
        const body = (await request.json()) as { path?: string };

        if (body.path === "/oauth/device/authorize") {
          return HttpResponse.json({
            device_code: "device-code",
            user_code: "ABC",
            verification_uri: "javascript:alert(1)",
            verification_uri_complete: "javascript:alert(1)",
            expires_in: 600,
            interval: 1,
          });
        }

        if (body.path === "/oauth/device/token") {
          return HttpResponse.json(
            { error: "authorization_pending" },
            { status: 400 },
          );
        }

        return HttpResponse.json({ error: "unexpected path" }, { status: 500 });
      }),
    );

    const popup = makePopup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(window, "open").mockReturnValue(popup);

    render(
      <DeviceFlowAuth
        host="https://app.all-hands.dev"
        onSuccess={vi.fn()}
        testIdRoot="cloud"
      />,
    );

    await userEvent.click(screen.getByTestId("cloud-login-button"));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith("Invalid verification URL");
    });
    expect(popup.location.href).toBe("");
    expect(popup.close).toHaveBeenCalled();
  });

  it("shows the manual-open warning when fallback popup opening is blocked", async () => {
    server.use(
      http.post("*/api/cloud-proxy", async ({ request }) => {
        const body = (await request.json()) as { path?: string };

        if (body.path === "/oauth/device/authorize") {
          return HttpResponse.json({
            device_code: "device-code",
            user_code: "ABC",
            verification_uri: "https://app.all-hands.dev/device",
            verification_uri_complete:
              "https://app.all-hands.dev/device?user_code=ABC",
            expires_in: 600,
            interval: 1,
          });
        }

        if (body.path === "/oauth/device/token") {
          return HttpResponse.json(
            { error: "authorization_pending" },
            { status: 400 },
          );
        }

        return HttpResponse.json({ error: "unexpected path" }, { status: 500 });
      }),
    );

    const primaryLocation = {};
    Object.defineProperty(primaryLocation, "href", {
      get: () => "",
      set: () => {
        throw new Error("cross-origin");
      },
    });
    const primaryPopup = {
      ...makePopup(),
      location: primaryLocation,
    } as unknown as Window & { close: ReturnType<typeof vi.fn> };
    vi.spyOn(window, "open")
      .mockReturnValueOnce(primaryPopup)
      .mockReturnValueOnce(null);

    render(
      <DeviceFlowAuth
        host="https://app.all-hands.dev"
        onSuccess={vi.fn()}
        testIdRoot="cloud"
      />,
    );

    await userEvent.click(screen.getByTestId("cloud-login-button"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "BACKEND$AUTH_OPEN_MANUALLY",
      );
    });
    expect(primaryPopup.close).toHaveBeenCalled();
  });
});
