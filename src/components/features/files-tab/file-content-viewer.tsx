import { useTranslation } from "react-i18next";

import { I18nKey } from "#/i18n/declaration";
import { useWorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { HighlightedSourceView } from "./highlighted-source-view";
import type { ViewMode } from "./view-mode";

interface FileContentViewerProps {
  path: string;
  viewMode: ViewMode;
}

const HTML_LIKE_EXTS = new Set(["html", "htm", "svg"]);
const MARKDOWN_EXTS = new Set(["md", "markdown", "mdx"]);

function getExtension(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx === -1 ? "" : path.slice(idx + 1).toLowerCase();
}

/**
 * Renders the contents of a single workspace file. In `rich` mode we render
 * HTML / SVG / images / PDFs from the browser-renderable URL produced by the
 * file-content hook. In `plain` mode we always show the raw bytes as text (or
 * a fallback message for binaries).
 */
export function FileContentViewer({ path, viewMode }: FileContentViewerProps) {
  const { t } = useTranslation("openhands");
  const query = useWorkspaceFileContent(path);

  if (query.isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[var(--oh-muted)]">
        {t(I18nKey.FILES$LOADING_FILES)}
      </div>
    );
  }

  if (query.isError || !query.data) {
    // Show a load-error message rather than the binary-fallback string —
    // these are completely different failure modes (couldn't even fetch
    // the file vs. fetched fine but the bytes aren't previewable) and
    // mixing them up hides real backend failures behind a misleading
    // "Binary file" label. Prefer the underlying error's own message when
    // we have one; fall back to the generic translated string otherwise.
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm text-[var(--oh-muted)]"
        data-testid="file-content-viewer-error"
      >
        {(query.error as Error | undefined)?.message ??
          t(I18nKey.FILES$LOAD_ERROR)}
      </div>
    );
  }

  const { kind, text, staticUrl, mimeType } = query.data;

  // ----- Plain mode: raw source bytes, syntax-highlighted when we can
  // recognize the grammar (falls through to a `<pre>` otherwise). This
  // includes "plain" view of markdown / HTML, where the point is to see
  // the markup behind the rich preview.
  if (viewMode === "plain") {
    if (kind === "text" && text !== null) {
      return (
        <HighlightedSourceView
          path={path}
          text={text}
          mimeType={mimeType ?? undefined}
        />
      );
    }
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm text-[var(--oh-muted)]"
        data-testid="file-content-viewer-binary-fallback"
      >
        {t(I18nKey.FILES$BINARY_FALLBACK)}
      </div>
    );
  }

  // ----- Rich mode: render HTML, markdown, images, PDFs from staticUrl. ----
  if (kind === "image") {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-[var(--oh-surface)] p-4"
        data-testid="file-content-viewer-image"
      >
        <img
          src={staticUrl}
          alt={path}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  if (kind === "pdf") {
    // PDFs can carry embedded JavaScript (AcroForm, OpenAction…). Even
    // though `staticUrl` lives on the agent server origin, the PDF
    // viewer's scripting capability isn't worth the risk for a file
    // preview, so we sandbox the iframe. `allow-same-origin` lets the
    // browser's built-in PDF viewer load the underlying bytes without
    // tripping cross-origin restrictions; we omit `allow-scripts`
    // because no PDF preview we care about needs to run JS in the
    // parent's origin.
    return (
      <iframe
        title={path}
        src={staticUrl}
        sandbox="allow-same-origin"
        data-testid="file-content-viewer-iframe"
        className="h-full w-full bg-white"
      />
    );
  }

  if (kind === "binary") {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-sm text-[var(--oh-muted)]"
        data-testid="file-content-viewer-binary-fallback"
      >
        {t(I18nKey.FILES$BINARY_FALLBACK)}
      </div>
    );
  }

  // Text-like content.
  if (mimeType === "text/html" || HTML_LIKE_EXTS.has(getExtension(path))) {
    // Sandbox the preview iframe. The absence of `allow-scripts` means any
    // `<script>` (or `onerror=…`, inline event handler, …) inside the
    // previewed file is inert. This is exactly the safe-preview posture we
    // want — users can look at their HTML without it executing in the
    // canvas's context.
    return (
      <iframe
        title={path}
        src={staticUrl}
        sandbox="allow-same-origin"
        data-testid="file-content-viewer-iframe"
        className="h-full w-full bg-white"
      />
    );
  }

  if (kind === "text" && MARKDOWN_EXTS.has(getExtension(path))) {
    // Match the right-pane chrome color so the rich-rendered markdown
    // blends with the surrounding files tab instead of painting a stark
    // white card. We use `prose-invert` (typography plugin's dark-theme
    // variant) and then layer arbitrary CSS-variable overrides on top to
    // pin body / bold / quote text to pure white — the user specifically
    // asked for every text element (not just headings) to read as white.
    // The custom heading components in `markdown/headings.tsx` already
    // hard-code `text-white`, so headers stay white through this change.
    return (
      <div
        data-testid="file-content-viewer-markdown"
        className="h-full w-full overflow-auto bg-[var(--oh-surface)] text-white custom-scrollbar-always"
      >
        <div className="prose prose-sm prose-invert max-w-none p-6 [--tw-prose-body:#fff] [--tw-prose-bold:#fff] [--tw-prose-headings:#fff] [--tw-prose-lead:#fff] [--tw-prose-counters:#fff] [--tw-prose-quotes:#fff] [--tw-prose-quote-borders:var(--oh-border-subtle)] [--tw-prose-bullets:var(--oh-muted)] [--tw-prose-hr:var(--oh-border-subtle)] [--tw-prose-captions:var(--oh-muted)] [--tw-prose-kbd:#fff]">
          <MarkdownRenderer
            content={text ?? ""}
            includeStandard
            includeHeadings
          />
        </div>
      </div>
    );
  }

  // Rich mode for actual source code (.ts, .py, .yaml, .css, …): there
  // is no other "rich" rendering to fall back to, so highlighted source
  // IS the rich view. Identical to the plain-mode treatment — keeping
  // both branches reuse `HighlightedSourceView` means the toggle has the
  // same visual identity for source files in both modes (which is the
  // honest answer: source IS rendered code).
  if (kind === "text" && text !== null) {
    return (
      <HighlightedSourceView
        path={path}
        text={text}
        mimeType={mimeType ?? undefined}
      />
    );
  }

  // Truly unknown / empty payload — show a fallback so the pane is never
  // blank.
  return (
    <div
      className="flex h-full w-full items-center justify-center text-sm text-[var(--oh-muted)]"
      data-testid="file-content-viewer-binary-fallback"
    >
      {t(I18nKey.FILES$BINARY_FALLBACK)}
    </div>
  );
}
