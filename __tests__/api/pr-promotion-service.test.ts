import { describe, expect, it, beforeEach, vi } from "vitest";
import PrPromotionService from "#/api/pr-promotion-service";
import { buildCheckApproval } from "#/utils/check-approval";
import { CheckResult } from "#/utils/check-result";
import { CHECK_PR_PROMOTION_PATH } from "#/utils/check-pr-promotion";

const { executeCommandMock, writeTextFileMock } = vi.hoisted(() => ({
  executeCommandMock: vi.fn(),
  writeTextFileMock: vi.fn(),
}));

vi.mock("#/api/runtime-service/agent-server-runtime-service", () => ({
  default: {
    executeCommand: (...args: unknown[]) => executeCommandMock(...args),
    writeTextFile: (...args: unknown[]) => writeTextFileMock(...args),
  },
}));

const passedResult = CheckResult.parse(
  JSON.stringify({
    status: "passed",
    createdAt: "2026-06-26T09:00:00.000Z",
    checks: [{ title: "verified smoke", status: "passed" }],
  }),
)!;

const failedResult = CheckResult.parse(
  JSON.stringify({
    status: "failed",
    checks: [{ title: "verified smoke", status: "failed" }],
  }),
)!;

const approval = buildCheckApproval({
  approvedBy: "operator@example.com",
  approvedAt: "2026-06-26T09:30:00.000Z",
  resultCreatedAt: "2026-06-26T09:00:00.000Z",
});

describe("PrPromotionService", () => {
  beforeEach(() => {
    executeCommandMock.mockReset();
    writeTextFileMock.mockReset();
  });

  it("promotes approved passed evidence and records the PR metadata", async () => {
    executeCommandMock.mockResolvedValue({
      exit_code: 0,
      stdout:
        'git noise\nSPOTWISE_PR_PROMOTION_RESULT={"status":"created","url":"https://github.com/SpotwiseAI/spotwise-ui/pull/123","number":123,"branch":"openhands/conversation-1","base":"main"}\n',
      stderr: "",
    });

    const promotion = await PrPromotionService.promoteApprovedCheck({
      conversationUrl: "https://agent.example/conversations/1",
      sessionApiKey: "session-key",
      workingDir: "/workspace/project",
      conversationTitle: "Fix checkout bug",
      conversationLink:
        "https://agents.spotwise.ai/conversations/conversation-1",
      promotedBy: "operator@example.com",
      result: passedResult,
      approval,
    });

    expect(executeCommandMock).toHaveBeenCalledWith(
      "https://agent.example/conversations/1",
      "session-key",
      expect.stringContaining("SPOTWISE_PR_PROMOTION_RESULT"),
      "/workspace/project",
      120,
    );
    expect(executeCommandMock.mock.calls[0][2]).toContain('"commit"');
    expect(writeTextFileMock).toHaveBeenCalledWith(
      "https://agent.example/conversations/1",
      "session-key",
      CHECK_PR_PROMOTION_PATH,
      expect.stringContaining(
        "https://github.com/SpotwiseAI/spotwise-ui/pull/123",
      ),
      "/workspace/project",
    );
    expect(promotion).toMatchObject({
      status: "created",
      url: "https://github.com/SpotwiseAI/spotwise-ui/pull/123",
      number: 123,
      branch: "openhands/conversation-1",
      base: "main",
      promotedBy: "operator@example.com",
      resultCreatedAt: "2026-06-26T09:00:00.000Z",
      approvalApprovedAt: "2026-06-26T09:30:00.000Z",
    });
  });

  it("refuses to promote failed evidence", async () => {
    await expect(
      PrPromotionService.promoteApprovedCheck({
        conversationUrl: "https://agent.example/conversations/1",
        sessionApiKey: "session-key",
        workingDir: "/workspace/project",
        conversationTitle: "Fix checkout bug",
        conversationLink: null,
        promotedBy: "operator@example.com",
        result: failedResult,
        approval,
      }),
    ).rejects.toThrow("Only passed check results can be promoted");

    expect(executeCommandMock).not.toHaveBeenCalled();
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures without writing promotion metadata", async () => {
    executeCommandMock.mockResolvedValue({
      exit_code: 1,
      stdout: "",
      stderr: "Working tree has uncommitted changes",
    });

    await expect(
      PrPromotionService.promoteApprovedCheck({
        conversationUrl: "https://agent.example/conversations/1",
        sessionApiKey: "session-key",
        workingDir: "/workspace/project",
        conversationTitle: "Fix checkout bug",
        conversationLink: null,
        promotedBy: "operator@example.com",
        result: passedResult,
        approval,
      }),
    ).rejects.toThrow("Working tree has uncommitted changes");

    expect(writeTextFileMock).not.toHaveBeenCalled();
  });
});
