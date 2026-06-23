import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ConversationDiffStatChip,
  formatDiffCount,
} from "#/components/features/conversation-panel/conversation-card/conversation-diff-stat-chip";

describe("formatDiffCount", () => {
  it("formats counts compactly", () => {
    expect(formatDiffCount(0)).toBe("0");
    expect(formatDiffCount(30)).toBe("30");
    expect(formatDiffCount(999)).toBe("999");
    expect(formatDiffCount(1000)).toBe("1k");
    expect(formatDiffCount(1700)).toBe("1.7k");
    expect(formatDiffCount(3749)).toBe("3.7k");
    expect(formatDiffCount(12000)).toBe("12k");
  });
});

describe("ConversationDiffStatChip", () => {
  it("renders additions and deletions", () => {
    render(
      <ConversationDiffStatChip stat={{ additions: 3700, deletions: 1700 }} />,
    );
    const chip = screen.getByTestId("conversation-diff-stat");
    expect(chip).toHaveTextContent("+3.7k");
    expect(chip).toHaveTextContent("-1.7k");
  });

  it("omits a side that is zero", () => {
    render(<ConversationDiffStatChip stat={{ additions: 30, deletions: 0 }} />);
    const chip = screen.getByTestId("conversation-diff-stat");
    expect(chip).toHaveTextContent("+30");
    expect(chip).not.toHaveTextContent("-");
  });

  it("renders nothing when there are no changes", () => {
    const { container } = render(
      <ConversationDiffStatChip stat={{ additions: 0, deletions: 0 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
