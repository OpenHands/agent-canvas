import { describe, expect, it } from "vitest";
import { buildCheckApproval } from "#/utils/check-approval";
import { CheckResult } from "#/utils/check-result";
import {
  buildCheckPrPromotion,
  buildPullRequestBody,
  CHECK_PR_PROMOTION_VERSION,
  CheckPrPromotion,
} from "#/utils/check-pr-promotion";

describe("CheckPrPromotion", () => {
  it("round-trips a valid promotion record", () => {
    const promotion = buildCheckPrPromotion({
      status: "created",
      url: "https://github.com/SpotwiseAI/spotwise-ui/pull/123",
      number: 123,
      branch: "openhands/conversation-1",
      base: "main",
      promotedBy: "operator@example.com",
      promotedAt: "2026-06-26T10:00:00.000Z",
      resultCreatedAt: "2026-06-26T09:00:00.000Z",
      approvalApprovedAt: "2026-06-26T09:30:00.000Z",
    });

    expect(
      CheckPrPromotion.parse(CheckPrPromotion.stringify(promotion)),
    ).toEqual(promotion);
  });

  it.each(["javascript:alert(1)", "https://example.com/pull/1"])(
    "rejects malformed promotion URL %s",
    (url) => {
      expect(
        CheckPrPromotion.parse(
          JSON.stringify({
            version: CHECK_PR_PROMOTION_VERSION,
            status: "created",
            url,
            number: 1,
            branch: "branch",
            base: "main",
            promotedAt: "2026-06-26T10:00:00.000Z",
            promotedBy: "operator@example.com",
            resultCreatedAt: null,
            approvalApprovedAt: null,
          }),
        ),
      ).toBeNull();
    },
  );
});

describe("buildPullRequestBody", () => {
  it("links durable evidence and approval context", () => {
    const result = CheckResult.parse(
      JSON.stringify({
        status: "passed",
        createdAt: "2026-06-26T09:00:00.000Z",
        spec: "specs/verification.md",
        video:
          "https://raw.githubusercontent.com/SpotwiseAI/agent-canvas/checks-media/.checks/run.webm",
        trace:
          "https://raw.githubusercontent.com/SpotwiseAI/agent-canvas/checks-media/.checks/trace.zip",
        checks: [{ title: "verified smoke", status: "passed" }],
      }),
    );
    const approval = buildCheckApproval({
      approvedBy: "operator@example.com",
      approvedAt: "2026-06-26T09:30:00.000Z",
      resultCreatedAt: "2026-06-26T09:00:00.000Z",
    });

    expect(result).not.toBeNull();
    const body = buildPullRequestBody({
      conversationUrl:
        "https://agents.spotwise.ai/conversations/conversation-1",
      result: result!,
      approval,
    });

    expect(body).toContain("Status: passed");
    expect(body).toContain("Approved by: operator@example.com");
    expect(body).toContain(".checks/result.json");
    expect(body).toContain(".checks/approval.json");
    expect(body).toContain("specs/verification.md");
    expect(body).toContain(
      "https://agents.spotwise.ai/conversations/conversation-1",
    );
    expect(body).toContain("✅ verified smoke");
  });
});
