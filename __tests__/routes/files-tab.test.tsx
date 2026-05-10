/* eslint-disable react/jsx-props-no-spreading */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";

import FilesTab from "#/routes/files-tab";

// Mocks must be declared before the SUT is imported.
const useIsGitRepoMock = vi.fn();
const useHasGitCommitsMock = vi.fn();
const useWorkspaceFilesMock = vi.fn();
const useWorkspaceFileContentMock = vi.fn();
const refetchGitChangesMock = vi.fn();

vi.mock("#/hooks/use-is-git-repo", () => ({
  useIsGitRepo: () => useIsGitRepoMock(),
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
    useIsGitRepoMock.mockReset();
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

  it("defaults to diff view when working inside a git repo", () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: true, isLoading: false });

    renderTab();

    expect(screen.getByTestId("changes-tab-content")).toBeInTheDocument();
    // The Rich/Plain toggle is hidden when diff view is active.
    expect(
      screen.queryByTestId("files-tab-content-mode-toggle"),
    ).not.toBeInTheDocument();
  });

  it("defaults to files+rich view in a git repo with zero commits (unborn HEAD)", () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: true, isLoading: false });
    useHasGitCommitsMock.mockReturnValue({
      hasCommits: false,
      isLoading: false,
    });

    renderTab();

    // Even though it's an attached repo, the diff view is suppressed when
    // there's nothing to diff against.
    expect(screen.queryByTestId("changes-tab-content")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("files-tab-content-mode-toggle"),
    ).toBeInTheDocument();
  });

  it("does NOT probe for commits when there is no attached repo", () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: false, isLoading: false });

    renderTab();

    // The hook is still called (so the diff toggle has a value), but it
    // must be called with enabled: false so we don't shell out to the
    // workspace pointlessly.
    expect(useHasGitCommitsMock).toHaveBeenCalledWith({ enabled: false });
  });

  it("optimistically defaults to diff view while the has-commits probe is still loading", () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: true, isLoading: false });
    useHasGitCommitsMock.mockReturnValue({
      hasCommits: null,
      isLoading: true,
    });

    renderTab();

    // The common case is a repo with commits, so to avoid a files→diff
    // flash on initial mount we lean diff-view while loading.
    expect(screen.getByTestId("changes-tab-content")).toBeInTheDocument();
  });

  it("defaults to plain file viewer when not in a git repo", () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: false, isLoading: false });

    renderTab();

    expect(screen.queryByTestId("changes-tab-content")).not.toBeInTheDocument();
    // Tree is collapsed by default — user expands via the caret.
    expect(screen.queryByTestId("files-tab-tree")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("files-tab-content-mode-toggle"),
    ).toBeInTheDocument();
  });

  it("lets users toggle diff view off even when in a git repo", async () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: true, isLoading: false });
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
    useIsGitRepoMock.mockReturnValue({ isGitRepo: false, isLoading: false });

    renderTab();

    // Either index.html (top-priority entrypoint) should be selected.
    expect(useWorkspaceFileContentMock).toHaveBeenCalledWith("index.html");
  });

  it("renders the binary fallback in plain mode for binary files", async () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: false, isLoading: false });
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
    useIsGitRepoMock.mockReturnValue({ isGitRepo: false, isLoading: false });

    renderTab();

    // The pill for src/main.ts should display the full relative path.
    const pill = screen.getByTestId("file-quick-row-item-src/main.ts");
    expect(pill).toHaveTextContent("src/main.ts");
  });

  it("collapses the file tree by default and expands it via the caret", async () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: false, isLoading: false });
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
    useIsGitRepoMock.mockReturnValue({ isGitRepo: false, isLoading: false });
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
  });

  it("uses the static workspace URL as the iframe src for HTML files", async () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: false, isLoading: false });
    useWorkspaceFilesMock.mockReturnValue({
      data: ["index.html"],
      isLoading: false,
    });
    const staticUrl =
      "http://localhost:3000/api/conversations/abc/workspace/index.html";
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
    expect(iframe).toHaveAttribute("src", staticUrl);
    // The iframe must not be sandboxed away from itself — relative asset
    // refs in the served HTML rely on the same-origin static fileserver.
    expect(iframe).not.toHaveAttribute("sandbox");
  });

  it("switches between rich and plain content modes", async () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: false, isLoading: false });
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
    expect(screen.getByTestId("file-content-viewer-plain")).toBeInTheDocument();
  });

  it("shows the refresh button inside the files-tab toolbar and triggers a refetch", async () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: false, isLoading: false });
    const user = userEvent.setup();

    renderTab();

    const refresh = screen.getByTestId("files-tab-refresh");
    expect(refresh).toBeInTheDocument();
    await user.click(refresh);
    expect(refetchGitChangesMock).toHaveBeenCalledTimes(1);
  });
});
