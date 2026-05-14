export const STATIC_BUILD_REFRESH_INTERVAL_MS = 10_000;
export const STATIC_BUILD_REFRESH_QUERY_PARAM = "__agent_canvas_static_refresh";

type HtmlResponse = Pick<Response, "ok" | "text">;

interface StaticBuildRefreshOptions {
  currentAssets?: string[];
  htmlUrl?: string;
  fetcher?: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<HtmlResponse>;
  reload?: () => void;
}

interface StaticBuildRefreshWatcherOptions extends StaticBuildRefreshOptions {
  intervalMs?: number;
}

function getAssetPathsFromHtml(html: string): string[] {
  return Array.from(
    html.matchAll(/["'](\/assets\/[^"']+)["']/g),
    (match) => match[1],
  );
}

function getCurrentDocumentAssets(): string[] {
  if (typeof document === "undefined") return [];
  return [
    ...new Set(getAssetPathsFromHtml(document.documentElement.outerHTML)),
  ];
}

function getCurrentHtmlUrl(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  url.searchParams.set(STATIC_BUILD_REFRESH_QUERY_PARAM, String(Date.now()));
  return url.toString();
}

export async function refreshIfStaticAssetsChanged(
  options: StaticBuildRefreshOptions = {},
): Promise<boolean> {
  const currentAssets = options.currentAssets ?? getCurrentDocumentAssets();
  if (currentAssets.length === 0) return false;

  const fetcher = options.fetcher ?? globalThis.fetch?.bind(globalThis);
  if (!fetcher) return false;

  const htmlUrl = options.htmlUrl ?? getCurrentHtmlUrl();
  if (!htmlUrl) return false;

  try {
    const response = await fetcher(htmlUrl, {
      cache: "no-store",
      headers: { Accept: "text/html" },
    });
    if (!response.ok) return false;

    const nextHtml = await response.text();
    if (currentAssets.every((asset) => nextHtml.includes(asset))) {
      return false;
    }

    const reload = options.reload ?? (() => globalThis.location?.reload?.());
    reload();
    return true;
  } catch {
    return false;
  }
}

export function startStaticBuildRefreshWatcher(
  options: StaticBuildRefreshWatcherOptions = {},
): () => void {
  if (typeof window === "undefined") return () => {};

  const currentAssets = options.currentAssets ?? getCurrentDocumentAssets();
  if (currentAssets.length === 0) return () => {};

  let pending = false;

  const check = () => {
    if (document.visibilityState === "hidden" || pending) return;
    pending = true;
    void refreshIfStaticAssetsChanged({ ...options, currentAssets }).finally(
      () => {
        pending = false;
      },
    );
  };

  const interval = window.setInterval(
    check,
    options.intervalMs ?? STATIC_BUILD_REFRESH_INTERVAL_MS,
  );
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  check();

  return () => {
    window.clearInterval(interval);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", check);
  };
}
