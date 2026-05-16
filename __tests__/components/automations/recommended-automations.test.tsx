import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecommendedAutomationsSection } from "#/components/features/automations/recommended-automations-section";
import { RecommendedAutomationSetupModal } from "#/components/features/automations/recommended-automation-setup-modal";
import { RECOMMENDED_AUTOMATIONS } from "#/constants/recommended-automations";
import { MCP_MARKETPLACE } from "#/constants/mcp-marketplace";
import type { MCPServerConfig } from "#/types/mcp-server";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (vars?.name) return `${key}:${String(vars.name)}`;
      if (vars?.count != null) return `${key}:${String(vars.count)}`;
      return key;
    },
  }),
}));

const githubServer: MCPServerConfig = {
  id: "stdio-0",
  type: "stdio",
  name: "github",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
};

describe("recommended automations", () => {
  it("shows recommended automations in popularity order", () => {
    const onSelect = vi.fn();

    render(
      <RecommendedAutomationsSection
        backendKind="local"
        installedServers={[]}
        onSelect={onSelect}
      />,
    );

    const cards = screen.getAllByTestId(/^recommended-automation-card-/);
    expect(cards[0]).toHaveAttribute(
      "data-testid",
      "recommended-automation-card-github-pr-reviewer",
    );
    expect(cards[1]).toHaveAttribute(
      "data-testid",
      "recommended-automation-card-slack-standup-digest",
    );
  });

  it("filters recommendations by required MCP keywords", () => {
    render(
      <RecommendedAutomationsSection
        backendKind="local"
        installedServers={[]}
        query="standup"
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("recommended-automation-card-slack-standup-digest"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recommended-automation-card-github-pr-reviewer"),
    ).not.toBeInTheDocument();
  });

  it("requires missing MCPs before launching a recommendation", () => {
    const automation = RECOMMENDED_AUTOMATIONS.find(
      (item) => item.id === "github-pr-reviewer",
    )!;
    const githubEntry = MCP_MARKETPLACE.find((entry) => entry.id === "github")!;
    const onInstallMcp = vi.fn();
    const onLaunch = vi.fn();

    const { rerender } = render(
      <RecommendedAutomationSetupModal
        automation={automation}
        requiredEntries={[githubEntry]}
        installedServers={[]}
        isLaunching={false}
        onInstallMcp={onInstallMcp}
        onLaunch={onLaunch}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("recommended-automation-launch")).toBeDisabled();
    fireEvent.click(
      screen.getByTestId("recommended-automation-install-github"),
    );
    expect(onInstallMcp).toHaveBeenCalledWith(githubEntry);

    rerender(
      <RecommendedAutomationSetupModal
        automation={automation}
        requiredEntries={[githubEntry]}
        installedServers={[githubServer]}
        isLaunching={false}
        onInstallMcp={onInstallMcp}
        onLaunch={onLaunch}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("recommended-automation-launch"));
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });
});
