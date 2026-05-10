import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import { I18nKey } from "#/i18n/declaration";
import { useWorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";
import type { ViewMode } from "./view-mode";

interface FileContentViewerProps {
  path: string;
  viewMode: ViewMode;
}

const HTML_LIKE_EXTS = new Set(["html", "htm", "svg"]);

function getExtension(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx === -1 ? "" : path.slice(idx + 1).toLowerCase();
}

/**
 * Renders the contents of a single workspace file. In `rich` mode we let the
 * browser render HTML/markdown/images/PDFs through a sandboxed iframe; in
 * `plain` mode we always show the raw bytes as text (or a fallback message
 * for binaries).
 */
export function FileContentViewer({ path, viewMode }: FileContentViewerProps) {
  const { t } = useTranslation("openhands");
  const query = useWorkspaceFileContent(path);
  const lastBlobUrl = useRef<string | null>(null);

  // Release object URLs when the underlying data changes / the component
  // unmounts so we don't leak.
  useEffect(() => {
    const url = query.data?.blobUrl ?? null;
    if (lastBlobUrl.current && lastBlobUrl.current !== url) {
      URL.revokeObjectURL(lastBlobUrl.current);
    }
    lastBlobUrl.current = url;
    return () => {
      if (lastBlobUrl.current && lastBlobUrl.current !== url) {
        URL.revokeObjectURL(lastBlobUrl.current);
      }
    };
  }, [query.data?.blobUrl]);

  // For markdown, build a small HTML wrapper so the iframe renders
  // something readable in "rich" mode. We deliberately avoid pulling in a
  // markdown library here — the iframe is sandboxed, and the goal is just a
  // best-effort preview, not a full editor experience.
  const markdownIframeUrl = useMemo(() => {
    if (!query.data || query.data.kind !== "text") return null;
    if (getExtension(path) !== "md" && getExtension(path) !== "markdown") {
      return null;
    }
    const text = query.data.text ?? "";
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 16px; color: #222; background: #fff; }
      pre { white-space: pre-wrap; }
    </style></head><body><pre>${escaped}</pre></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    return URL.createObjectURL(blob);
  }, [query.data, path]);

  useEffect(
    () => () => {
      if (markdownIframeUrl) URL.revokeObjectURL(markdownIframeUrl);
    },
    [markdownIframeUrl],
  );

  if (query.isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[#9299AA]">
        {t(I18nKey.FILES$LOADING_FILES)}
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm text-[#9299AA]"
        data-testid="file-content-viewer-error"
      >
        {(query.error as Error | undefined)?.message ??
          t(I18nKey.FILES$BINARY_FALLBACK)}
      </div>
    );
  }

  const { kind, text, blobUrl, mimeType } = query.data;

  // ----- Plain mode: always raw text, or a fallback for binary. -----
  if (viewMode === "plain") {
    if (kind === "text" && text !== null) {
      return (
        <pre
          data-testid="file-content-viewer-plain"
          className="h-full w-full overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-5 text-[#D6D6D6] custom-scrollbar-always"
        >
          {text}
        </pre>
      );
    }
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm text-[#9299AA]"
        data-testid="file-content-viewer-binary-fallback"
      >
        {t(I18nKey.FILES$BINARY_FALLBACK)}
      </div>
    );
  }

  // ----- Rich mode: render HTML, markdown, images, PDFs in an iframe. -----
  if (kind === "image" && blobUrl) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-[#1F2125] p-4"
        data-testid="file-content-viewer-image"
      >
        <img
          src={blobUrl}
          alt={path}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  if (kind === "pdf" && blobUrl) {
    return (
      <iframe
        title={path}
        src={blobUrl}
        sandbox=""
        data-testid="file-content-viewer-iframe"
        className="h-full w-full bg-white"
      />
    );
  }

  if (kind === "binary") {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm text-[#9299AA]"
        data-testid="file-content-viewer-binary-fallback"
      >
        {t(I18nKey.FILES$BINARY_FALLBACK)}
      </div>
    );
  }

  // Text-like content.
  if (mimeType === "text/html" || HTML_LIKE_EXTS.has(getExtension(path))) {
    const htmlBlob = new Blob([text ?? ""], { type: "text/html" });
    const htmlUrl = URL.createObjectURL(htmlBlob);
    return (
      <iframe
        title={path}
        src={htmlUrl}
        sandbox=""
        data-testid="file-content-viewer-iframe"
        className="h-full w-full bg-white"
        onLoad={() => URL.revokeObjectURL(htmlUrl)}
      />
    );
  }

  if (markdownIframeUrl) {
    return (
      <iframe
        title={path}
        src={markdownIframeUrl}
        sandbox=""
        data-testid="file-content-viewer-iframe"
        className="h-full w-full bg-white"
      />
    );
  }

  // Fallback for plain text in rich mode: still show the text so users see
  // something rather than an empty pane.
  return (
    <pre
      data-testid="file-content-viewer-plain"
      className="h-full w-full overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-5 text-[#D6D6D6] custom-scrollbar-always"
    >
      {text ?? ""}
    </pre>
  );
}
