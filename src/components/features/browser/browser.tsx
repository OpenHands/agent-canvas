import { BrowserSnapshot } from "./browser-snapshot";
import { BrowserChromeBar } from "./browser-chrome-bar";
import { EmptyBrowserMessage } from "./empty-browser-message";
import { useBrowserStore } from "#/stores/browser-store";

export function BrowserPanel() {
  const { url, screenshotSrc } = useBrowserStore();
  const hasPage = Boolean(screenshotSrc);

  const imgSrc = screenshotSrc?.startsWith("data:image/png;base64,")
    ? screenshotSrc
    : `data:image/png;base64,${screenshotSrc ?? ""}`;

  return (
    <div className="h-full w-full flex flex-col text-[var(--oh-muted)]">
      <BrowserChromeBar url={url} hasPage={hasPage} />
      <div className="overflow-y-auto grow scrollbar-hide rounded-xl">
        {screenshotSrc ? (
          <BrowserSnapshot src={imgSrc} />
        ) : (
          <EmptyBrowserMessage />
        )}
      </div>
    </div>
  );
}
