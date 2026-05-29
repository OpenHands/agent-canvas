import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test-utils";
import {
  LlmConnectionStatus,
  type LlmVerifyState,
} from "#/components/features/settings/llm-settings/llm-connection-status";

function render(state: LlmVerifyState, onSaveAnyway?: () => void) {
  return renderWithProviders(
    <LlmConnectionStatus state={state} onSaveAnyway={onSaveAnyway} />,
  );
}

describe("LlmConnectionStatus", () => {
  it("renders nothing for idle status", () => {
    const { container } = render({ status: "idle" });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the agent-server lacks the verify endpoint", () => {
    // Old servers degrade silently — we don't want to scare the user with
    // an error they can't fix.
    const { container } = render({ status: "endpoint_missing" });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the verifying spinner", () => {
    render({ status: "verifying" });
    expect(screen.getByTestId("llm-verify-testing")).toBeInTheDocument();
  });

  it("renders the success banner", () => {
    render({ status: "success" });
    expect(screen.getByTestId("llm-verify-success")).toBeInTheDocument();
  });

  it("renders the rate-limited banner (soft success — save unblocked)", () => {
    render({ status: "rate_limited" });
    expect(screen.getByTestId("llm-verify-rate-limited")).toBeInTheDocument();
  });

  it.each([
    ["auth_error", "llm-verify-auth-error"],
    ["bad_request", "llm-verify-bad-request"],
  ])("renders the hard-failure banner for %s", (status, testId) => {
    render({ status: status as LlmVerifyState["status"] });
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it("uses provider-supplied message when present, else falls back to i18n", () => {
    render({ status: "auth_error", message: "Provider says: bad key" });
    expect(screen.getByText("Provider says: bad key")).toBeInTheDocument();
  });

  it.each([
    ["timeout", "llm-verify-timeout"],
    ["unreachable", "llm-verify-unreachable"],
    ["unknown_error", "llm-verify-unknown-error"],
  ])(
    "renders the indeterminate banner with a Save anyway button for %s",
    (status, testId) => {
      const onSaveAnyway = vi.fn();
      render({ status: status as LlmVerifyState["status"] }, onSaveAnyway);

      expect(screen.getByTestId(testId)).toBeInTheDocument();
      expect(screen.getByTestId("llm-verify-save-anyway")).toBeInTheDocument();
    },
  );

  it("hides the Save anyway affordance when no callback is provided", () => {
    render({ status: "timeout" });
    expect(screen.queryByTestId("llm-verify-save-anyway")).toBeNull();
  });

  it("invokes onSaveAnyway when the user clicks it", async () => {
    const onSaveAnyway = vi.fn();
    const user = userEvent.setup();
    render({ status: "unreachable" }, onSaveAnyway);

    await user.click(screen.getByTestId("llm-verify-save-anyway"));
    expect(onSaveAnyway).toHaveBeenCalledTimes(1);
  });
});
