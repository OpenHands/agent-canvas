import type { CheckApproval } from "./check-approval";
import type { CheckResult } from "./check-result";

export const CHECK_PR_PROMOTION_PATH = ".checks/pr.json";
export const CHECK_PR_PROMOTION_VERSION = 1;
export const PR_BODY_REPO_PLACEHOLDER = "__SPOTWISE_REPO__";
export const PR_BODY_BRANCH_PLACEHOLDER = "__SPOTWISE_BRANCH__";

export type CheckPrPromotionStatus = "created" | "updated";

export interface CheckPrPromotion {
  version: typeof CHECK_PR_PROMOTION_VERSION;
  status: CheckPrPromotionStatus;
  url: string;
  number: number;
  branch: string;
  base: string;
  promotedAt: string;
  promotedBy: string;
  resultCreatedAt: string | null;
  approvalApprovedAt: string | null;
}

interface BuildCheckPrPromotionInput {
  status: CheckPrPromotionStatus;
  url: string;
  number: number;
  branch: string;
  base: string;
  promotedBy: string;
  resultCreatedAt: string | null;
  approvalApprovedAt: string | null;
  promotedAt?: string;
}

interface BuildPullRequestBodyInput {
  conversationUrl: string | null;
  result: CheckResult;
  approval: CheckApproval;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function readStatus(value: unknown): CheckPrPromotionStatus | null {
  return value === "created" || value === "updated" ? value : null;
}

function readNullableString(value: unknown): string | null {
  return value === null ? null : readString(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isGithubPullRequestUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      /^\/[^/]+\/[^/]+\/pull\/\d+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function githubBlobUrl(path: string): string {
  return `https://github.com/${PR_BODY_REPO_PLACEHOLDER}/blob/${PR_BODY_BRANCH_PLACEHOLDER}/${path}`;
}

function renderArtifact(label: string, value: string | null): string | null {
  if (!value) return null;
  if (isHttpUrl(value)) return `- ${label}: [${value}](${value})`;
  return `- ${label}: [\`${value}\`](${githubBlobUrl(value)})`;
}

export function buildCheckPrPromotion(
  input: BuildCheckPrPromotionInput,
): CheckPrPromotion {
  return {
    version: CHECK_PR_PROMOTION_VERSION,
    status: input.status,
    url: input.url,
    number: input.number,
    branch: input.branch,
    base: input.base,
    promotedAt: input.promotedAt ?? new Date().toISOString(),
    promotedBy: input.promotedBy,
    resultCreatedAt: input.resultCreatedAt,
    approvalApprovedAt: input.approvalApprovedAt,
  };
}

export function buildPullRequestBody({
  conversationUrl,
  result,
  approval,
}: BuildPullRequestBodyInput): string {
  const artifacts = [
    renderArtifact("Check result", ".checks/result.json"),
    renderArtifact("Approval", ".checks/approval.json"),
    renderArtifact("Decisions", ".checks/decisions.jsonl"),
    renderArtifact("Spec", result.spec),
    renderArtifact("Video", result.video),
    renderArtifact("Trace", result.trace),
    renderArtifact("Conversation", conversationUrl),
  ].filter((line): line is string => line !== null);

  const checks = result.checks.map((check) => {
    const prefix = check.status === "passed" ? "✅" : "❌";
    const title = check.title ?? check.status;
    return `- ${prefix} ${title}`;
  });

  return [
    "## Agent Canvas verification",
    "",
    `Status: ${result.status}`,
    `Approved by: ${approval.approvedBy}`,
    approval.approvedAt ? `Approved at: ${approval.approvedAt}` : null,
    result.createdAt ? `Result created at: ${result.createdAt}` : null,
    "",
    "### Evidence",
    ...artifacts,
    checks.length > 0 ? "" : null,
    checks.length > 0 ? "### Checks" : null,
    ...checks,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export const CheckPrPromotion = {
  parse(text: string): CheckPrPromotion | null {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isRecord(parsed)) return null;

      if (parsed.version !== CHECK_PR_PROMOTION_VERSION) return null;
      const status = readStatus(parsed.status);
      const url = readString(parsed.url);
      const number = readNumber(parsed.number);
      const branch = readString(parsed.branch);
      const base = readString(parsed.base);
      const promotedAt = readString(parsed.promotedAt);
      const promotedBy = readString(parsed.promotedBy);
      const resultCreatedAt = readNullableString(parsed.resultCreatedAt);
      const approvalApprovedAt = readNullableString(parsed.approvalApprovedAt);

      if (
        !status ||
        !url ||
        !isGithubPullRequestUrl(url) ||
        number === null ||
        !branch ||
        !base ||
        !promotedAt ||
        !promotedBy
      ) {
        return null;
      }

      return {
        version: CHECK_PR_PROMOTION_VERSION,
        status,
        url,
        number,
        branch,
        base,
        promotedAt,
        promotedBy,
        resultCreatedAt,
        approvalApprovedAt,
      };
    } catch {
      return null;
    }
  },

  stringify(promotion: CheckPrPromotion): string {
    return `${JSON.stringify(promotion, null, 2)}\n`;
  },
};
