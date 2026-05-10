/* eslint-disable react/jsx-props-no-spreading */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router";

// Mocks must be declared before the SUT is imported.
const useIsGitRepoMock = vi.fn();
const useWorkspaceFilesMock = vi.fn();
const useWorkspaceFileContentMock = vi.fn();

vi.mock("#/hooks/use-is-git-repo", () => ({
  useIsGitRepo: () => useIsGitRepoMock(),
}));

vi.mock("#/hooks/query/use-workspace-files", () => ({
  useWorkspaceFiles: () => useWorkspaceFilesMock(),
}));

vi.mock("#/hooks/query/use-workspace-file-content", () => ({
  useWorkspaceFileContent: (path: string | null) =>
    useWorkspaceFileContentMock(path),
}));

vi.mock("#/routes/changes-tab", () => ({
  default: () => <div data-testid="changes-tab-content">Diff View</div>,
}));

import FilesTab from "#/routes/files-tab";

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
    useWorkspaceFilesMock.mockReset();
    useWorkspaceFileContentMock.mockReset();

    useWorkspaceFilesMock.mockReturnValue({
      data: ["index.html", "src/main.ts", "README.md"],
      isLoading: false,
    });
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "index.html",
        absolutePath: "/work/index.html",
        kind: "text",
        text: "<!doctype html><html><body>hello</body></html>",
        blobUrl: null,
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

  it("defaults to plain file viewer when not in a git repo", () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: false, isLoading: false });

    renderTab();

    expect(screen.queryByTestId("changes-tab-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("files-tab-tree")).toBeInTheDocument();
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
    await user.click(
      screen.getByTestId("files-tab-diff-toggle-option-off"),
    );

    await waitFor(() => {
      expect(screen.queryByTestId("changes-tab-content")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("files-tab-tree")).toBeInTheDocument();
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
        absolutePath: "/work/logo.png",
        kind: "binary",
        text: null,
        blobUrl: "blob:fake",
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

  it("switches between rich and plain content modes", async () => {
    useIsGitRepoMock.mockReturnValue({ isGitRepo: false, isLoading: false });
    useWorkspaceFileContentMock.mockReturnValue({
      data: {
        path: "src/main.ts",
        absolutePath: "/work/src/main.ts",
        kind: "text",
        text: "console.log('hi');",
        blobUrl: null,
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
    expect(
      screen.getByTestId("file-content-viewer-plain"),
    ).toBeInTheDocument();
  });
});
