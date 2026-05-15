import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ConversationCardSkeleton } from "./conversation-card-skeleton";

describe("ConversationCardSkeleton", () => {
  it("renders skeleton card", () => {
    render(<ConversationCardSkeleton />);
    expect(
      screen.getByTestId("conversation-card-skeleton"),
    ).toBeInTheDocument();
  });

  it("renders compact skeleton without text placeholders", () => {
    render(<ConversationCardSkeleton compact />);
    expect(
      screen.getByTestId("conversation-card-skeleton-compact"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("conversation-card-skeleton"),
    ).not.toBeInTheDocument();
  });
});
