import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RunStatusBadge } from "#/components/features/automations/detail/run-status-badge";
import { AutomationRunStatus } from "#/types/automation";

describe("RunStatusBadge", () => {
  it("renders badge with correct style for completed status", () => {
    const { container } = render(
      <RunStatusBadge status={AutomationRunStatus.COMPLETED} />,
    );
    const badge = container.querySelector("span");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("text-success");
  });

  it("renders badge with correct style for failed status", () => {
    const { container } = render(
      <RunStatusBadge status={AutomationRunStatus.FAILED} />,
    );
    const badge = container.querySelector("span");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("text-red-400");
  });

  it("renders badge with correct style for pending status", () => {
    const { container } = render(
      <RunStatusBadge status={AutomationRunStatus.PENDING} />,
    );
    const badge = container.querySelector("span");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("text-neutral-400");
  });

  it("renders badge with correct style for running status", () => {
    const { container } = render(
      <RunStatusBadge status={AutomationRunStatus.RUNNING} />,
    );
    const badge = container.querySelector("span");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("text-neutral-400");
  });
});
