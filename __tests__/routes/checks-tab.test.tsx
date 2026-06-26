import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import ChecksTab from "#/routes/checks-tab";
import { CHECK_RESULT_PATH } from "#/utils/check-result";
import { CHECK_PR_PROMOTION_PATH } from "#/utils/check-pr-promotion";
import { DECISIONS_PATH } from "#/utils/decision-log";
import { renderWithProviders } from "../../test-utils";

// The tab reads `.checks/result.json` (and any recording) through this hook,
// and drives live-refresh through the auto-refresh hook. Both are mocked so
// the tests exercise the tab's own render logic in isolation.
const useWorkspaceFileContentMock = vi.fn();
const writeTextFileMock = vi.fn();
const promoteApprovedCheckMock = vi.fn();

vi.mock("#/hooks/query/use-workspace-file-content", () => ({
  useWorkspaceFileContent: (path: string | null) =>
    useWorkspaceFileContentMock(path),
}));

vi.mock("#/hooks/use-auto-refresh-files-on-edit", () => ({
  useAutoRefreshFilesOnEdit: vi.fn(),
}));

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => ({
    data: {
      id: "conversation-1",
      conversation_url: "https://agent.example/conversations/1",
      session_api_key: "session-key",
      workspace: { working_dir: "/workspace/project" },
    },
  }),
}));

vi.mock("#/hooks/use-current-user-email", () => ({
  useCurrentUserEmail: () => "operator@example.com",
}));

vi.mock("#/api/runtime-service/agent-server-runtime-service", () => ({
  default: {
    writeTextFile: (...args: unknown[]) => writeTextFileMock(...args),
  },
}));

vi.mock("#/api/pr-promotion-service", () => ({
  default: {
    promoteApprovedCheck: (...args: unknown[]) =>
      promoteApprovedCheckMock(...args),
  },
}));

/** A settled query carrying the decoded text of `.checks/result.json`. */
const textResult = (text: string) => ({
  data: {
    path: CHECK_RESULT_PATH,
    kind: "text",
    text,
    staticUrl: "",
    mimeType: "application/json",
  },
  isLoading: false,
  isError: false,
});

const loadingResult = { data: undefined, isLoading: true, isError: false };
// The query throws (file missing) → settled, errored, no data.
const missingResult = { data: undefined, isLoading: false, isError: true };

/** A settled query for a recording, exposing the fileserver `staticUrl`. */
const videoContent = (staticUrl: string) => ({
  data: {
    path: ".checks/run.webm",
    kind: "binary",
    text: null,
    staticUrl,
    mimeType: "video/webm",
  },
  isLoading: false,
  isError: false,
});

const passedJson = JSON.stringify({
  status: "passed",
  spec: "tests/e2e/verified/cockpit-loads.spec.ts",
  checks: [
    { title: "cockpit shell loads", status: "passed", durationMs: 1200 },
  ],
});

/** Route the mock by path: result file vs. decision log vs. recording. */
function wire({
  result,
  video,
  decisions,
}: {
  result:
    | ReturnType<typeof textResult>
    | typeof loadingResult
    | typeof missingResult;
  video?:
    | ReturnType<typeof videoContent>
    | { data: undefined; isLoading: boolean; isError: boolean };
  decisions?: ReturnType<typeof textResult>;
}) {
  useWorkspaceFileContentMock.mockImplementation((path: string | null) => {
    if (path === CHECK_RESULT_PATH) return result;
    if (path === CHECK_PR_PROMOTION_PATH) return missingResult;
    if (path === DECISIONS_PATH) return decisions ?? missingResult;
    return video ?? missingResult;
  });
}

describe("ChecksTab", () => {
  beforeEach(() => {
    useWorkspaceFileContentMock.mockReset();
    writeTextFileMock.mockReset();
    promoteApprovedCheckMock.mockReset();
  });

  it("shows a loading indicator while the result query is in flight", () => {
    wire({ result: loadingResult });
    renderWithProviders(<ChecksTab />);
    expect(screen.getByTestId("checks-tab-loading")).toBeInTheDocument();
  });

  it("shows the empty state (with hint) when no result file exists", () => {
    wire({ result: missingResult });
    renderWithProviders(<ChecksTab />);
    expect(screen.getByText("CHECKS$EMPTY")).toBeInTheDocument();
    expect(screen.getByText("CHECKS$EMPTY_HINT")).toBeInTheDocument();
    expect(screen.queryByTestId("checks-tab")).not.toBeInTheDocument();
  });

  it("shows the unreadable state when the result file is present but malformed", () => {
    wire({ result: textResult("{ not json") });
    renderWithProviders(<ChecksTab />);
    expect(screen.getByText("CHECKS$UNREADABLE")).toBeInTheDocument();
    expect(screen.queryByText("CHECKS$EMPTY")).not.toBeInTheDocument();
  });

  it("renders a passed verdict with the spec path and check rows", () => {
    wire({ result: textResult(passedJson) });
    renderWithProviders(<ChecksTab />);

    expect(screen.getByTestId("checks-tab")).toBeInTheDocument();
    expect(screen.getByTestId("checks-tab-status-passed")).toBeInTheDocument();
    expect(
      screen.getByText("tests/e2e/verified/cockpit-loads.spec.ts"),
    ).toBeInTheDocument();
    expect(screen.getByText("cockpit shell loads")).toBeInTheDocument();
    expect(screen.getByTestId("checks-tab-approve-button")).toBeInTheDocument();
    // Advisory note is always present on a loaded result.
    expect(screen.getByText("CHECKS$ADVISORY")).toBeInTheDocument();
  });

  it("records operator approval for passed evidence", async () => {
    wire({ result: textResult(passedJson) });
    renderWithProviders(<ChecksTab />);

    await userEvent.click(screen.getByTestId("checks-tab-approve-button"));

    expect(writeTextFileMock).toHaveBeenCalledTimes(1);
    expect(writeTextFileMock.mock.calls[0][0]).toBe(
      "https://agent.example/conversations/1",
    );
    expect(writeTextFileMock.mock.calls[0][1]).toBe("session-key");
    expect(writeTextFileMock.mock.calls[0][2]).toBe(".checks/approval.json");
    expect(JSON.parse(writeTextFileMock.mock.calls[0][3])).toMatchObject({
      version: 1,
      status: "approved",
      approvedBy: "operator@example.com",
      resultStatus: "passed",
    });
    expect(writeTextFileMock.mock.calls[0][4]).toBe("/workspace/project");
  });

  it("renders existing operator approval instead of another approve button", () => {
    wire({
      result: textResult(passedJson),
      decisions: textResult(""),
    });
    useWorkspaceFileContentMock.mockImplementation((path: string | null) => {
      if (path === CHECK_RESULT_PATH) return textResult(passedJson);
      if (path === ".checks/approval.json") {
        return textResult(
          JSON.stringify({
            version: 1,
            status: "approved",
            approvedAt: "2026-06-26T08:00:00.000Z",
            approvedBy: "operator@example.com",
            resultStatus: "passed",
            resultCreatedAt: null,
            notes: null,
          }),
        );
      }
      return missingResult;
    });

    renderWithProviders(<ChecksTab />);

    expect(screen.getByTestId("checks-tab-approval")).toHaveTextContent(
      "operator@example.com",
    );
    expect(
      screen.queryByTestId("checks-tab-approve-button"),
    ).not.toBeInTheDocument();
  });

  it("promotes approved evidence to a draft PR", async () => {
    const approvalJson = JSON.stringify({
      version: 1,
      status: "approved",
      approvedAt: "2026-06-26T08:00:00.000Z",
      approvedBy: "operator@example.com",
      resultStatus: "passed",
      resultCreatedAt: null,
      notes: null,
    });
    useWorkspaceFileContentMock.mockImplementation((path: string | null) => {
      if (path === CHECK_RESULT_PATH) return textResult(passedJson);
      if (path === ".checks/approval.json") return textResult(approvalJson);
      return missingResult;
    });
    promoteApprovedCheckMock.mockResolvedValue({
      version: 1,
      status: "created",
      url: "https://github.com/SpotwiseAI/spotwise-ui/pull/123",
      number: 123,
      branch: "openhands/conversation-1",
      base: "main",
      promotedAt: "2026-06-26T08:01:00.000Z",
      promotedBy: "operator@example.com",
      resultCreatedAt: null,
      approvalApprovedAt: "2026-06-26T08:00:00.000Z",
    });

    renderWithProviders(<ChecksTab />);
    await userEvent.click(screen.getByTestId("checks-tab-promote-pr-button"));

    expect(promoteApprovedCheckMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationUrl: "https://agent.example/conversations/1",
        sessionApiKey: "session-key",
        workingDir: "/workspace/project",
        conversationLink: "http://localhost:3000/conversations/conversation-1",
        promotedBy: "operator@example.com",
      }),
    );
  });

  it("renders an existing draft PR link instead of another promotion button", () => {
    const approvalJson = JSON.stringify({
      version: 1,
      status: "approved",
      approvedAt: "2026-06-26T08:00:00.000Z",
      approvedBy: "operator@example.com",
      resultStatus: "passed",
      resultCreatedAt: null,
      notes: null,
    });
    const promotionJson = JSON.stringify({
      version: 1,
      status: "created",
      url: "https://github.com/SpotwiseAI/spotwise-ui/pull/123",
      number: 123,
      branch: "openhands/conversation-1",
      base: "main",
      promotedAt: "2026-06-26T08:01:00.000Z",
      promotedBy: "operator@example.com",
      resultCreatedAt: null,
      approvalApprovedAt: "2026-06-26T08:00:00.000Z",
    });
    useWorkspaceFileContentMock.mockImplementation((path: string | null) => {
      if (path === CHECK_RESULT_PATH) return textResult(passedJson);
      if (path === ".checks/approval.json") return textResult(approvalJson);
      if (path === CHECK_PR_PROMOTION_PATH) return textResult(promotionJson);
      return missingResult;
    });

    renderWithProviders(<ChecksTab />);

    expect(screen.getByTestId("checks-tab-pr-link")).toHaveAttribute(
      "href",
      "https://github.com/SpotwiseAI/spotwise-ui/pull/123",
    );
    expect(
      screen.queryByTestId("checks-tab-promote-pr-button"),
    ).not.toBeInTheDocument();
  });

  it("renders a failed verdict and surfaces the failing check's error", () => {
    wire({
      result: textResult(
        JSON.stringify({
          checks: [
            {
              title: "launcher visible",
              status: "failed",
              error: "expected element to be visible",
            },
          ],
        }),
      ),
    });
    renderWithProviders(<ChecksTab />);

    expect(screen.getByTestId("checks-tab-status-failed")).toBeInTheDocument();
    expect(
      screen.getByText("expected element to be visible"),
    ).toBeInTheDocument();
  });

  it("gives each check row a non-color status label and data-status for AT/screen readers", () => {
    wire({
      result: textResult(
        JSON.stringify({
          checks: [
            { title: "a", status: "passed" },
            { title: "b", status: "failed" },
          ],
        }),
      ),
    });
    renderWithProviders(<ChecksTab />);

    const rows = screen.getAllByTestId("checks-tab-check");
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual([
      "passed",
      "failed",
    ]);
    // Status is also present as text per-row (not color-only) — sr-only but in
    // the DOM. Scope to each row so the overall badge's label doesn't collide.
    expect(within(rows[0]).getByText("CHECKS$PASSED")).toBeInTheDocument();
    expect(within(rows[1]).getByText("CHECKS$FAILED")).toBeInTheDocument();
  });

  it("renders a titleless check using its status label as visible text (never blank)", () => {
    wire({
      result: textResult(
        JSON.stringify({ checks: [{ status: "failed", error: "boom" }] }),
      ),
    });
    renderWithProviders(<ChecksTab />);

    // The overall verdict is failed (red check forces it) and the row is shown.
    expect(screen.getByTestId("checks-tab-status-failed")).toBeInTheDocument();
    expect(screen.getByTestId("checks-tab-check")).toHaveAttribute(
      "data-status",
      "failed",
    );
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("shows a 'recording unavailable' message when a worktree recording settles without a URL", () => {
    wire({
      result: textResult(
        JSON.stringify({ status: "passed", video: ".checks/run.webm" }),
      ),
      // Query settled (not loading) with no data — e.g. the fetch errored.
      video: { data: undefined, isLoading: false, isError: true },
    });
    renderWithProviders(<ChecksTab />);

    expect(
      screen.getByTestId("checks-tab-video-unavailable"),
    ).toBeInTheDocument();
    // Must NOT spin forever, and must not pretend a player exists.
    expect(
      screen.queryByTestId("checks-tab-video-loading"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("checks-tab-video")).not.toBeInTheDocument();
  });

  it("renders an inline <video> for a worktree-relative recording", () => {
    wire({
      result: textResult(
        JSON.stringify({ status: "passed", video: ".checks/run.webm" }),
      ),
      video: videoContent(
        "https://agent.example/api/.../workspace/.checks/run.webm",
      ),
    });
    renderWithProviders(<ChecksTab />);

    const video = screen.getByTestId("checks-tab-video");
    expect(video).toHaveAttribute(
      "src",
      "https://agent.example/api/.../workspace/.checks/run.webm",
    );
    // The worktree path was resolved through the workspace fileserver.
    expect(useWorkspaceFileContentMock).toHaveBeenCalledWith(
      ".checks/run.webm",
    );
    expect(screen.getByTestId("checks-tab-video-open")).toBeInTheDocument();
  });

  it("uses an allowlisted absolute recording URL directly without a workspace fetch", () => {
    const videoUrl =
      "https://raw.githubusercontent.com/SpotwiseAI/agent-canvas/media/.checks/run.mp4";
    wire({
      result: textResult(
        JSON.stringify({
          status: "passed",
          video: videoUrl,
        }),
      ),
    });
    renderWithProviders(<ChecksTab />);

    expect(screen.getByTestId("checks-tab-video")).toHaveAttribute(
      "src",
      videoUrl,
    );
    // An absolute URL must NOT be fetched through the workspace fileserver —
    // the video hook is disabled (called with null).
    expect(useWorkspaceFileContentMock).toHaveBeenCalledWith(null);
    expect(useWorkspaceFileContentMock).not.toHaveBeenCalledWith(
      "https://media.example/run.mp4",
    );
  });

  it("shows a recording placeholder while the video resolves", () => {
    wire({
      result: textResult(
        JSON.stringify({ status: "passed", video: ".checks/run.webm" }),
      ),
      video: { data: undefined, isLoading: true, isError: false },
    });
    renderWithProviders(<ChecksTab />);

    expect(screen.getByTestId("checks-tab-video-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("checks-tab-video")).not.toBeInTheDocument();
  });

  it("renders the decision log beside the verdict, in order", () => {
    const decisions = [
      {
        decision: "use the existing Playwright runner",
        why: "avoids a new dependency",
        evidence: "playwright.config.ts:14",
        outcome: "verified-dev passed",
      },
      { decision: "ship advisory, not blocking" },
    ]
      .map((d) => JSON.stringify(d))
      .join("\n");

    wire({ result: textResult(passedJson), decisions: textResult(decisions) });
    renderWithProviders(<ChecksTab />);

    const rows = screen.getAllByTestId("checks-tab-decision");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("use the existing Playwright runner");
    expect(rows[0]).toHaveTextContent("avoids a new dependency");
    expect(rows[0]).toHaveTextContent("playwright.config.ts:14");
    expect(rows[0]).toHaveTextContent("verified-dev passed");
    expect(rows[1]).toHaveTextContent("ship advisory, not blocking");
    // The section heading is present.
    expect(screen.getByText("CHECKS$DECISIONS")).toBeInTheDocument();
  });

  it("renders no Decisions section when the log is absent or empty", () => {
    wire({ result: textResult(passedJson), decisions: textResult("   \n") });
    renderWithProviders(<ChecksTab />);

    expect(screen.getByTestId("checks-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("checks-tab-decision")).not.toBeInTheDocument();
    expect(screen.queryByText("CHECKS$DECISIONS")).not.toBeInTheDocument();
  });
});
