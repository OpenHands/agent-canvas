/* eslint-disable react/jsx-props-no-spreading */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";

import FilesTab from "#/routes/files-tab";

// Mocks must be declared before the SUT is imported.
const useHasAttachedSourceMock = vi.fn();
const useHasGitCommitsMock = vi.fn();
const useWorkspaceFilesMock = vi.fn();
const useWorkspaceFileContentMock = vi.fn();
const refetchGitChangesMock = vi.fn();

vi.mock("#/hooks/use-has-attached-source", () => ({
  useHasAttachedSource: () => useHasAttachedSourceMock(),
}));

vi.mock("#/hooks/query/use-has-git-commits", () => ({
  useHasGitCommits: (opts?: { enabled?: boolean }) =>
    useHasGitCommitsMock(opts),
}));

vi.mock("#/hooks/query/use-workspace-files", () => ({
  useWorkspaceFiles: () => useWorkspaceFilesMock(),
}));

vi.mock("#/hooks/query/use-workspace-file-content", () => ({
  useWorkspaceFileContent: (path: string | null) =>
    useWorkspaceFileContentMock(path),
}));

vi.mock("#/hooks/query/use-unified-get-git-changes", () => ({
  useUnifiedGetGitChanges: () => ({
    refetch: refetchGitChangesMock,
    isFetching: false,
  }),
}));

vi.mock("#/routes/changes-tab", () => ({
  default: () => <div data-testid="changes-tab-content">Diff View</div>,
}));

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <FilesTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("FilesTab", () => {
  beforeEach(() => {
    useHasAttachedSourceMock.mockReset();
    useHasGitCommitsMock.mockReset();
    useWorkspaceFilesMock.mockReset();
    useWorkspaceFileContentMock.mockReset();
    refetchGitChangesMock.mockReset();
    // Default: pretend the probe has already resolved with at least one
    // commit. Individual tests can override this for "empty repo" cases.
    useHasGitCommitsMock.mockReturnValue({
      hasCommits: true,
      isLoading: false,
    });

    useWorkspaceFilesMock.mockReturnValue({
      data: ["index.html", "src/main.ts", "README.md"],
      isLoading: false,
    });
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "index.html",
        kind: "text",
        text: "<!doctype html><html><body>hello</body></html>",
        staticUrl:
          "http://localhost:3000/api/conversations/c1/workspace/index.html",
        mimeType: "text/html",
      },
      isLoading: false,
      isError: false,
    });
  });

  it("defaults to diff view when the user attached a source (repo or workspace)", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: true,
      isLoading: false,
    });

    renderTab();

    expect(screen.getByTestId("changes-tab-content")).toBeInTheDocument();
    // The Rich/Plain toggle is hidden when diff view is active.
    expect(
      screen.queryByTestId("files-tab-content-mode-toggle"),
    ).not.toBeInTheDocument();
  });

  it("defaults to files+rich view when the attached source has no commits (non-git workspace or unborn HEAD)", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: true,
      isLoading: false,
    });
    useHasGitCommitsMock.mockReturnValue({
      hasCommits: false,
      isLoading: false,
    });

    renderTab();

    // Even though something is attached, the diff view is suppressed when
    // there's nothing to diff against.
    expect(screen.queryByTestId("changes-tab-content")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("files-tab-content-mode-toggle"),
    ).toBeInTheDocument();
  });

  it("does NOT probe for commits when no source is attached", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });

    renderTab();

    // The hook is still called (so the diff toggle has a value), but it
    // must be called with enabled: false so we don't shell out to the
    // workspace pointlessly.
    expect(useHasGitCommitsMock).toHaveBeenCalledWith({ enabled: false });
  });

  it("optimistically defaults to diff view while the attachment / has-commits probes are still loading", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: true,
      isLoading: false,
    });
    useHasGitCommitsMock.mockReturnValue({
      hasCommits: null,
      isLoading: true,
    });

    renderTab();

    // The common case is a repo with commits, so to avoid a files→diff
    // flash on initial mount we lean diff-view while loading.
    expect(screen.getByTestId("changes-tab-content")).toBeInTheDocument();
  });

  it("defaults to plain file viewer when no source is attached", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });

    renderTab();

    expect(screen.queryByTestId("changes-tab-content")).not.toBeInTheDocument();
    // Tree is collapsed by default — user expands via the caret.
    expect(screen.queryByTestId("files-tab-tree")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("files-tab-content-mode-toggle"),
    ).toBeInTheDocument();
  });

  it("lets users toggle diff view off even when a source is attached", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: true,
      isLoading: false,
    });
    const user = userEvent.setup();

    renderTab();

    expect(screen.getByTestId("changes-tab-content")).toBeInTheDocument();

    // Click the "Files" segment of the diff-view toggle.
    await user.click(screen.getByTestId("files-tab-diff-toggle-option-off"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("changes-tab-content"),
      ).not.toBeInTheDocument();
    });
    // Quick-row toggle exists and the file-viewer area is shown.
    expect(
      screen.getByTestId("file-quick-row-tree-toggle"),
    ).toBeInTheDocument();
  });

  it("auto-selects the highest-priority file on first render", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });

    renderTab();

    // Either index.html (top-priority entrypoint) should be selected.
    expect(useWorkspaceFileContentMock).toHaveBeenCalledWith("index.html");
  });

  it("renders the binary fallback in plain mode for binary files", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "logo.png",
        kind: "binary",
        text: null,
        staticUrl:
          "http://localhost:3000/api/conversations/c1/workspace/logo.png",
        mimeType: "application/octet-stream",
      },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderTab();

    await user.click(
      screen.getByTestId("files-tab-content-mode-toggle-option-plain"),
    );

    expect(
      screen.getByTestId("file-content-viewer-binary-fallback"),
    ).toBeInTheDocument();
  });

  it("shows full file paths (not just basenames) as quick-row pills", () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });

    renderTab();

    // The pill for src/main.ts should display the full relative path.
    const pill = screen.getByTestId("file-quick-row-item-src/main.ts");
    expect(pill).toHaveTextContent("src/main.ts");
  });

  it("collapses the file tree by default and expands it via the caret", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    const user = userEvent.setup();

    renderTab();

    // Hidden by default.
    expect(screen.queryByTestId("files-tab-tree")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("file-quick-row-tree-toggle"));
    expect(screen.getByTestId("files-tab-tree")).toBeInTheDocument();

    await user.click(screen.getByTestId("file-quick-row-tree-toggle"));
    expect(screen.queryByTestId("files-tab-tree")).not.toBeInTheDocument();
  });

  it("renders markdown content via MarkdownRenderer in rich mode", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    // Only expose a markdown file so it is auto-selected as the first
    // priority entry.
    useWorkspaceFilesMock.mockReturnValue({
      data: ["README.md"],
      isLoading: false,
    });
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "README.md",
        kind: "text",
        text: "# Hello\n\nSome **bold** text",
        staticUrl:
          "http://localhost:3000/api/conversations/c1/workspace/README.md",
        mimeType: "text/markdown",
      },
      isLoading: false,
      isError: false,
    });

    renderTab();

    await waitFor(() => {
      expect(
        screen.getByTestId("file-content-viewer-markdown"),
      ).toBeInTheDocument();
    });

    // react-markdown turns "# Hello" into an <h1>.
    expect(
      screen.getByRole("heading", { level: 1, name: "Hello" }),
    ).toBeInTheDocument();
    expect(screen.getByText("bold").tagName.toLowerCase()).toBe("strong");
    // Markdown rendering uses MarkdownRenderer, not an iframe.
    expect(
      screen.queryByTestId("file-content-viewer-iframe"),
    ).not.toBeInTheDocument();

    // The rich-rendered markdown container must paint the right-pane bg
    // color (so it blends with the surrounding chrome) and project white
    // text — both spelled out in the user's design ask.
    const container = screen.getByTestId("file-content-viewer-markdown");
    expect(container.className).toContain("bg-[#25272D]");
    expect(container.className).toContain("text-white");
  });

  it("shows highlighted source (not rich markdown) when toggled to plain on a .md", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    useWorkspaceFilesMock.mockReturnValue({
      data: ["README.md"],
      isLoading: false,
    });
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "README.md",
        kind: "text",
        text: "# Hello\n\nSome **bold** text",
        staticUrl:
          "http://localhost:3000/api/conversations/c1/workspace/README.md",
        mimeType: "text/markdown",
      },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderTab();

    // Toggle to plain — markdown source should now be syntax-highlighted
    // as `markdown`, not rendered.
    await user.click(
      screen.getByTestId("files-tab-content-mode-toggle-option-plain"),
    );

    const highlighted = await screen.findByTestId(
      "file-content-viewer-highlighted",
    );
    expect(highlighted.getAttribute("data-language")).toBe("markdown");
    // Confirm the rich-rendered <h1> is gone.
    expect(
      screen.queryByRole("heading", { level: 1, name: "Hello" }),
    ).not.toBeInTheDocument();
  });

  it("uses the browser preview URL as the iframe src for HTML files", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    useWorkspaceFilesMock.mockReturnValue({
      data: ["index.html"],
      isLoading: false,
    });
    const staticUrl = "blob:preview-url";
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "index.html",
        kind: "text",
        text: "<!doctype html><body>hi</body>",
        staticUrl,
        mimeType: "text/html",
      },
      isLoading: false,
      isError: false,
    });

    renderTab();

    const iframe = await screen.findByTestId("file-content-viewer-iframe");
    expect(iframe).toBeInTheDocument();
    // The iframe src uses the hook-provided browser preview URL directly;
    // mutation freshness is handled by the hook's query key, not by mutating
    // Blob URLs with cache-buster query params.
    expect(iframe).toHaveAttribute("src", staticUrl);
    // The iframe is sandboxed with `allow-same-origin` only: `<script>` /
    // inline event handlers inside the previewed file are inert. We deliberately
    // do NOT add `allow-scripts` — a workspace HTML file's scripts must not run
    // in the canvas's context.
    expect(iframe).toHaveAttribute("sandbox", "allow-same-origin");
  });

  it("switches between rich and plain content modes", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    // Only `src/main.ts` is exposed so it auto-selects (otherwise the
    // priority sort picks `index.html` first and the assertion below
    // would see the markup grammar instead).
    useWorkspaceFilesMock.mockReturnValue({
      data: ["src/main.ts"],
      isLoading: false,
    });
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "src/main.ts",
        kind: "text",
        text: "console.log('hi');",
        staticUrl:
          "http://localhost:3000/api/conversations/c1/workspace/src/main.ts",
        mimeType: "text/plain",
      },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderTab();

    await user.click(
      screen.getByTestId("files-tab-content-mode-toggle-option-plain"),
    );
    // `src/main.ts` resolves to a Prism grammar (`typescript`), so the
    // plain view is a syntax-highlighted source view rather than a raw
    // `<pre>`. We assert the highlighted container and its data-language
    // attribute as a regression guard.
    const highlighted = await screen.findByTestId(
      "file-content-viewer-highlighted",
    );
    expect(highlighted).toBeInTheDocument();
    expect(highlighted.getAttribute("data-language")).toBe("typescript");
  });

  it("shows the refresh button inside the files-tab toolbar and triggers a refetch", async () => {
    useHasAttachedSourceMock.mockReturnValue({
      hasAttachedSource: false,
      isLoading: false,
    });
    const user = userEvent.setup();

    renderTab();

    const refresh = screen.getByTestId("files-tab-refresh");
    expect(refresh).toBeInTheDocument();
    // The button should describe its *action* (refresh), not the surrounding
    // section name ("Files") — the old `COMMON$FILES` aria-label was
    // ambiguous for screen-reader users who couldn't see the refresh icon.
    expect(refresh).toHaveAttribute("aria-label", "FILES$REFRESH");
    await user.click(refresh);
    expect(refetchGitChangesMock).toHaveBeenCalledTimes(1);
  });
});
