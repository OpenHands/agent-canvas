import { describe, expect, it } from "vitest";

import {
  buildCheckApproval,
  CHECK_APPROVAL_PATH,
  CheckApproval,
} from "#/utils/check-approval";

describe("CheckApproval", () => {
  it("builds and parses an approval for a passed verification result", () => {
    const approval = buildCheckApproval({
      approvedBy: " operator@example.com ",
      approvedAt: "2026-06-26T08:00:00.000Z",
      resultCreatedAt: "2026-06-26T07:59:00.000Z",
      notes: " reviewed video evidence ",
    });

    expect(CHECK_APPROVAL_PATH).toBe(".checks/approval.json");
    expect(CheckApproval.parse(CheckApproval.stringify(approval))).toEqual({
      version: 1,
      status: "approved",
      approvedAt: "2026-06-26T08:00:00.000Z",
      approvedBy: "operator@example.com",
      resultStatus: "passed",
      resultCreatedAt: "2026-06-26T07:59:00.000Z",
      notes: "reviewed video evidence",
    });
  });

  it("rejects approvals that are not tied to a passed result", () => {
    expect(
      CheckApproval.parse(
        JSON.stringify({
          version: 1,
          status: "approved",
          approvedAt: "2026-06-26T08:00:00.000Z",
          approvedBy: "operator@example.com",
          resultStatus: "failed",
        }),
      ),
    ).toBeNull();
  });
});
