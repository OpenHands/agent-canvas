import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ChooseAgentStep,
  type OnboardingAgentId,
} from "#/components/features/onboarding/steps/choose-agent-step";

function renderStep(initial: OnboardingAgentId = "openhands") {
  const onSelect = vi.fn();
  const onNext = vi.fn();
  render(
    <ChooseAgentStep
      selectedAgentId={initial}
      onSelect={onSelect}
      onNext={onNext}
    />,
  );
  return { onSelect, onNext };
}

describe("ChooseAgentStep", () => {
  it("renders the three agent options with OpenHands marked selected", () => {
    renderStep();

    const openhands = screen.getByTestId("onboarding-agent-option-openhands");
    const claude = screen.getByTestId("onboarding-agent-option-claude-code");
    const codex = screen.getByTestId("onboarding-agent-option-codex");

    expect(openhands).toHaveAttribute("aria-checked", "true");
    expect(openhands).not.toBeDisabled();

    // Claude Code and Codex are visible but disabled / coming-soon.
    expect(claude).toBeDisabled();
    expect(claude).toHaveAttribute("aria-disabled", "true");
    expect(codex).toBeDisabled();
    expect(codex).toHaveAttribute("aria-disabled", "true");

    // The "coming soon" note is rendered.
    expect(
      screen.getByTestId("onboarding-agent-coming-soon"),
    ).toBeInTheDocument();
  });

  it("ignores clicks on the disabled agent options", async () => {
    const { onSelect } = renderStep();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("onboarding-agent-option-claude-code"));
    await user.click(screen.getByTestId("onboarding-agent-option-codex"));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("invokes onSelect when the OpenHands option is clicked", async () => {
    const { onSelect } = renderStep();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("onboarding-agent-option-openhands"));

    expect(onSelect).toHaveBeenCalledWith("openhands");
  });

  it("invokes onNext when the Next button is clicked", async () => {
    const { onNext } = renderStep();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("onboarding-agent-next"));

    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
