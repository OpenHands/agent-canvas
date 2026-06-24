import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBucketIcon } from "#/components/features/conversation-panel/status-bucket-icon";

describe("StatusBucketIcon", () => {
  it("renders a distinct glyph per bucket", () => {
    const { rerender } = render(<StatusBucketIcon bucketId="in_progress" />);
    expect(
      screen.getByTestId("status-bucket-icon-in_progress"),
    ).toBeInTheDocument();

    rerender(<StatusBucketIcon bucketId="in_review" />);
    expect(
      screen.getByTestId("status-bucket-icon-in_review"),
    ).toBeInTheDocument();

    rerender(<StatusBucketIcon bucketId="done" />);
    expect(screen.getByTestId("status-bucket-icon-done")).toBeInTheDocument();
  });

  it("fills the in_review pie more than the in_progress pie", () => {
    const { container: progress } = render(
      <StatusBucketIcon bucketId="in_progress" />,
    );
    const { container: review } = render(
      <StatusBucketIcon bucketId="in_review" />,
    );

    const dashOf = (root: HTMLElement) =>
      root
        .querySelector("circle[stroke-dasharray]")
        ?.getAttribute("stroke-dasharray")
        ?.split(" ")
        .map(Number) ?? [];

    const [progressFill] = dashOf(progress);
    const [reviewFill] = dashOf(review);
    expect(reviewFill).toBeGreaterThan(progressFill);
  });
});
