export const CHECK_APPROVAL_PATH = ".checks/approval.json";

export const CHECK_APPROVAL_VERSION = 1;

export interface CheckApproval {
  version: typeof CHECK_APPROVAL_VERSION;
  status: "approved";
  approvedAt: string;
  approvedBy: string;
  resultStatus: "passed";
  resultCreatedAt: string | null;
  notes: string | null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function buildCheckApproval(input: {
  approvedBy: string;
  resultCreatedAt?: string | null;
  approvedAt?: string;
  notes?: string | null;
}): CheckApproval {
  return {
    version: CHECK_APPROVAL_VERSION,
    status: "approved",
    approvedAt: input.approvedAt ?? new Date().toISOString(),
    approvedBy: input.approvedBy.trim(),
    resultStatus: "passed",
    resultCreatedAt: input.resultCreatedAt ?? null,
    notes: input.notes?.trim() || null,
  };
}

export const CheckApproval = {
  parse(text: string): CheckApproval | null {
    try {
      const raw = JSON.parse(text) as unknown;
      if (!raw || typeof raw !== "object") return null;
      const record = raw as Record<string, unknown>;
      if (record.version !== CHECK_APPROVAL_VERSION) return null;
      if (record.status !== "approved") return null;
      if (record.resultStatus !== "passed") return null;

      const approvedAt = readString(record.approvedAt);
      const approvedBy = readString(record.approvedBy);
      if (!approvedAt || !approvedBy) return null;

      const resultCreatedAt =
        typeof record.resultCreatedAt === "string" &&
        record.resultCreatedAt.trim().length > 0
          ? record.resultCreatedAt.trim()
          : null;
      const notes =
        typeof record.notes === "string" && record.notes.trim().length > 0
          ? record.notes.trim()
          : null;

      return {
        version: CHECK_APPROVAL_VERSION,
        status: "approved",
        approvedAt,
        approvedBy,
        resultStatus: "passed",
        resultCreatedAt,
        notes,
      };
    } catch {
      return null;
    }
  },

  stringify(approval: CheckApproval): string {
    return `${JSON.stringify(approval, null, 2)}\n`;
  },
} as const;
