import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import { VerificationVerdictBadge } from "#/components/features/conversation-panel/conversation-card/verification-verdict-badge";

describe("VerificationVerdictBadge", () => {
  it("renders nothing when there is no verdict", () => {
    // Most conversations have no verdict (unfinished, or pre-verification) —
    // that is the common, silent case, never an empty/error affordance.
    const { container } = renderWithProviders(
      <VerificationVerdictBadge status={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a passed verdict with a subject-bearing sr-only label", () => {
    renderWithProviders(<VerificationVerdictBadge status="passed" />);
    const badge = screen.getByTestId("verification-verdict-badge");
    expect(badge).toHaveAttribute("data-status", "passed");
    // a11y: the verdict reaches assistive tech via text, not color alone, and
    // the label names its subject ("Verification ...") since a dense row has no
    // surrounding heading to imply it.
    expect(
      screen.getByText("CONVERSATION_PANEL$VERIFICATION_PASSED"),
    ).toBeInTheDocument();
  });

  it("renders a failed verdict with a subject-bearing sr-only label", () => {
    renderWithProviders(<VerificationVerdictBadge status="failed" />);
    const badge = screen.getByTestId("verification-verdict-badge");
    expect(badge).toHaveAttribute("data-status", "failed");
    expect(
      screen.getByText("CONVERSATION_PANEL$VERIFICATION_FAILED"),
    ).toBeInTheDocument();
  });

  it("renders approved passed evidence as an approved verdict", () => {
    renderWithProviders(<VerificationVerdictBadge status="passed" approved />);
    const badge = screen.getByTestId("verification-verdict-badge");
    expect(badge).toHaveAttribute("data-status", "passed");
    expect(badge).toHaveAttribute("data-approved", "true");
    expect(
      screen.getByText("CONVERSATION_PANEL$VERIFICATION_APPROVED"),
    ).toBeInTheDocument();
  });

  it("hides the colored icon from assistive tech (color is not the sole signal)", () => {
    renderWithProviders(<VerificationVerdictBadge status="passed" />);
    const icon = screen
      .getByTestId("verification-verdict-badge")
      .querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("can open the detailed verification evidence when activated", async () => {
    const onOpenChecks = vi.fn();
    renderWithProviders(
      <VerificationVerdictBadge status="passed" onOpenChecks={onOpenChecks} />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "CONVERSATION_PANEL$VERIFICATION_PASSED",
      }),
    );

    expect(onOpenChecks).toHaveBeenCalledTimes(1);
  });
});
