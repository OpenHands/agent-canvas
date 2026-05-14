import { describe, expect, it, vi } from "vitest";
import {
  STATIC_BUILD_REFRESH_QUERY_PARAM,
  refreshIfStaticAssetsChanged,
} from "#/utils/static-build-refresh";

function htmlResponse(html: string): Pick<Response, "ok" | "text"> {
  return {
    ok: true,
    text: () => Promise.resolve(html),
  };
}

describe("static build refresh", () => {
  it("reloads when the current HTML no longer references a loaded asset", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      htmlResponse(`
        <script type="module" src="/assets/entry.client-new.js"></script>
        <link rel="stylesheet" href="/assets/root-new.css" />
      `),
    );
    const reload = vi.fn();

    await expect(
      refreshIfStaticAssetsChanged({
        currentAssets: ["/assets/entry.client-old.js", "/assets/root-old.css"],
        htmlUrl: "/conversations",
        fetcher,
        reload,
      }),
    ).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledWith(
      "/conversations",
      expect.objectContaining({
        cache: "no-store",
        headers: { Accept: "text/html" },
      }),
    );
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not reload when the current HTML still references the loaded assets", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      htmlResponse(`
        <script type="module" src="/assets/entry.client-current.js"></script>
        <link rel="stylesheet" href="/assets/root-current.css" />
      `),
    );
    const reload = vi.fn();

    await expect(
      refreshIfStaticAssetsChanged({
        currentAssets: [
          "/assets/entry.client-current.js",
          "/assets/root-current.css",
        ],
        htmlUrl: "/conversations",
        fetcher,
        reload,
      }),
    ).resolves.toBe(false);

    expect(reload).not.toHaveBeenCalled();
  });

  it("does nothing when the loaded page has no static assets", async () => {
    const fetcher = vi.fn();
    const reload = vi.fn();

    await expect(
      refreshIfStaticAssetsChanged({
        currentAssets: [],
        fetcher,
        reload,
      }),
    ).resolves.toBe(false);

    expect(fetcher).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("cache-busts the current HTML URL when one is not provided", async () => {
    window.history.pushState({}, "", "/conversations");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        htmlResponse('<script src="/assets/app.js"></script>'),
      );

    await refreshIfStaticAssetsChanged({
      currentAssets: ["/assets/app.js"],
      fetcher,
      reload: vi.fn(),
    });

    const requestedUrl = new URL(fetcher.mock.calls[0][0] as string);
    expect(requestedUrl.pathname).toBe("/conversations");
    expect(
      requestedUrl.searchParams.has(STATIC_BUILD_REFRESH_QUERY_PARAM),
    ).toBe(true);
  });
});
