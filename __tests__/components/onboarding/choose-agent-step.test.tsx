import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChooseAgentStep,
  type OnboardingAgentId,
} from "#/components/features/onboarding/steps/choose-agent-step";
import SettingsService from "#/api/settings-service/settings-service.api";

function renderStep(initial: OnboardingAgentId = "openhands") {
  const onSelect = vi.fn();
  const onNext = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ChooseAgentStep
        selectedAgentId={initial}
        onSelect={onSelect}
        onNext={onNext}
      />
    </QueryClientProvider>,
  );
  return { onSelect, onNext };
}

describe("ChooseAgentStep", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(SettingsService, "saveSettings").mockResolvedValue(true);
  });

  it("renders all four agent options with OpenHands marked selected by default", () => {
    renderStep();

    const openhands = screen.getByTestId("onboarding-agent-option-openhands");
    const claude = screen.getByTestId("onboarding-agent-option-claude-code");
    const codex = screen.getByTestId("onboarding-agent-option-codex");
    const gemini = screen.getByTestId("onboarding-agent-option-gemini-cli");

    expect(openhands).toHaveAttribute("aria-checked", "true");
    // All four options are clickable — ACP is no longer "coming soon".
    expect(openhands).not.toBeDisabled();
    expect(claude).not.toBeDisabled();
    expect(codex).not.toBeDisabled();
    expect(gemini).not.toBeDisabled();

    // Neither the legacy "coming soon" banner nor the per-option badges
    // should render now that all four agent kinds work end-to-end.
    expect(
      screen.queryByTestId("onboarding-agent-coming-soon"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("onboarding-agent-badge-claude-code"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("onboarding-agent-badge-codex"),
    ).not.toBeInTheDocument();
  });

  it("propagates click selections through onSelect for every option", async () => {
    const { onSelect } = renderStep();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("onboarding-agent-option-claude-code"));
    expect(onSelect).toHaveBeenLastCalledWith("claude-code");

    await user.click(screen.getByTestId("onboarding-agent-option-codex"));
    expect(onSelect).toHaveBeenLastCalledWith("codex");

    await user.click(screen.getByTestId("onboarding-agent-option-gemini-cli"));
    expect(onSelect).toHaveBeenLastCalledWith("gemini-cli");

    await user.click(screen.getByTestId("onboarding-agent-option-openhands"));
    expect(onSelect).toHaveBeenLastCalledWith("openhands");
  });

  it("persists agent_kind:'openhands' and advances on Next when OpenHands is selected", async () => {
    const save = vi.spyOn(SettingsService, "saveSettings");
    const { onNext } = renderStep("openhands");
    const user = userEvent.setup();

    await user.click(screen.getByTestId("onboarding-agent-next"));

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
      expect(onNext).toHaveBeenCalledTimes(1);
    });
    const call = save.mock.calls[0]?.[0] as {
      agent_settings_diff?: Record<string, unknown>;
    };
    expect(call.agent_settings_diff).toEqual({ agent_kind: "openhands" });
  });

  it("persists an ACP diff matching the registry when Claude Code is selected", async () => {
    const save = vi.spyOn(SettingsService, "saveSettings");
    const { onNext } = renderStep("claude-code");
    const user = userEvent.setup();

    await user.click(screen.getByTestId("onboarding-agent-next"));

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
      expect(onNext).toHaveBeenCalledTimes(1);
    });
    const call = save.mock.calls[0]?.[0] as {
      agent_settings_diff?: Record<string, unknown>;
    };
    expect(call.agent_settings_diff).toEqual({
      agent_kind: "acp",
      acp_server: "claude-code",
      // Default-command path: the backend resolves the command from its
      // own registry, so we don't pin a stale command here.
      acp_command: [],
      acp_model: null,
    });
  });

  it.each([
    ["codex", "codex"],
    ["gemini-cli", "gemini-cli"],
  ])("persists acp_server=%s for the matching tile", async (id, expected) => {
    const save = vi.spyOn(SettingsService, "saveSettings");
    renderStep(id as OnboardingAgentId);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("onboarding-agent-next"));

    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    const call = save.mock.calls[0]?.[0] as {
      agent_settings_diff?: Record<string, unknown>;
    };
    expect(
      (call.agent_settings_diff as Record<string, unknown>).acp_server,
    ).toBe(expected);
  });

  it("does not advance when the save mutation fails", async () => {
    vi.spyOn(SettingsService, "saveSettings").mockRejectedValueOnce(
      new Error("boom"),
    );
    const { onNext } = renderStep("claude-code");
    const user = userEvent.setup();

    await user.click(screen.getByTestId("onboarding-agent-next"));

    // saveSettings rejects → onSuccess is not called → onNext stays untouched.
    await waitFor(
      () => {
        expect(SettingsService.saveSettings).toHaveBeenCalledTimes(1);
      },
      { timeout: 1000 },
    );
    expect(onNext).not.toHaveBeenCalled();
  });
});
