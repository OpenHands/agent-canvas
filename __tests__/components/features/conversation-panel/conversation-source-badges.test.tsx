import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "test-utils";
import { ConversationSourceBadges } from "#/components/features/conversation-panel/conversation-card/conversation-source-badges";

describe("ConversationSourceBadges", () => {
  it("renders nothing without provenance tags", () => {
    const { container } = renderWithProviders(
      <ConversationSourceBadges tags={{ repo: "spotwise/ui" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders origin, linear, and requester values", () => {
    renderWithProviders(
      <ConversationSourceBadges
        tags={{ source: "hermes", linear: "ENG-123", requester: "raimonds" }}
      />,
    );
    expect(screen.getByText("hermes")).toBeInTheDocument();
    expect(screen.getByText("ENG-123")).toBeInTheDocument();
    expect(screen.getByText("raimonds")).toBeInTheDocument();
  });

  it("links the linear badge to the source url", () => {
    renderWithProviders(
      <ConversationSourceBadges
        tags={{
          linear: "ENG-9",
          sourceurl: "https://linear.app/issue/ENG-9",
        }}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://linear.app/issue/ENG-9");
    expect(link).toHaveTextContent("ENG-9");
  });
});
