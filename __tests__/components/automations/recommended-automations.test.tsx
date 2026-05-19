import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import { getConversationState } from "#/utils/conversation-local-storage";
import {
  RecommendedAutomationsLauncher,
  buildAutomationPrompt,
} from "#/components/features/automations/recommended-automations-launcher";
import { RecommendedAutomationsSection } from "#/components/features/automations/recommended-automations-section";
import { AUTOMATION_CATALOG } from "@openhands/extensions/automations";

const { mockCreateConversationMutate, mockUseSettings } = vi.hoisted(() => ({
  mockCreateConversationMutate: vi.fn(),
  mockUseSettings: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      if (vars?.name) return `${key}:${String(vars.name)}`;
      if (vars?.count != null) return `${key}:${String(vars.count)}`;
      return key;
    },
  }),
}));

vi.mock("#/hooks/mutation/use-create-conversation", () => ({
  useCreateConversation: () => ({
    mutate: mockCreateConversationMutate,
    isPending: false,
  }),
}));

vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => mockUseSettings(),
}));

function renderLauncher() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RecommendedAutomationsLauncher />
    </QueryClientProvider>,
  );
}

function settingsWithMcpConfig(mcp_config: unknown) {
  return {
    agent_settings: {
      mcp_config,
    },
  };
}

describe("recommended automations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseSettings.mockReturnValue({
      data: settingsWithMcpConfig({ mcpServers: {} }),
    });
  });

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

  it("selects a recommendation directly from its card", () => {
    const automation = AUTOMATION_CATALOG.find(
      (item) => item.id === "github-pr-reviewer",
    )!;
    const onSelect = vi.fn();

    render(
      <RecommendedAutomationsSection
        backendKind="local"
        installedServers={[]}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(
      screen.getByTestId("recommended-automation-card-github-pr-reviewer"),
    );
    expect(onSelect).toHaveBeenCalledWith(automation);
  });

  it("opens the MCP install modal instead of launching when the required MCP is missing", async () => {
    renderLauncher();

    fireEvent.click(
      screen.getByTestId("recommended-automation-card-github-pr-reviewer"),
    );

    const modal = await screen.findByTestId("mcp-install-modal");
    expect(modal).toHaveAttribute("data-marketplace-id", "github");
    expect(
      screen.getByTestId("mcp-install-field-GITHUB_PERSONAL_ACCESS_TOKEN"),
    ).toBeInTheDocument();
    expect(mockCreateConversationMutate).not.toHaveBeenCalled();
  });

  it("launches directly with local automation API instructions when the required MCP is already installed", () => {
    mockUseSettings.mockReturnValue({
      data: settingsWithMcpConfig({
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-github"],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: "github-token" },
          },
        },
      }),
    });

    renderLauncher();

    fireEvent.click(
      screen.getByTestId("recommended-automation-card-github-pr-reviewer"),
    );

    expect(mockCreateConversationMutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("mcp-install-modal")).not.toBeInTheDocument();

    const [, options] = mockCreateConversationMutate.mock.calls[0];
    options.onSuccess({ conversation_id: "conversation-1" });

    const draft = getConversationState("conversation-1").draftMessage;
    expect(draft).toContain("local");
    expect(draft).toContain("$OPENHANDS_AUTOMATION_API_KEY");
    expect(draft).not.toContain("app.all-hands.dev");
    expect(draft).not.toContain("$OPENHANDS_API_KEY");
  });

  it("launches the recommendation after the missing MCP is installed", async () => {
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderLauncher();

    fireEvent.click(
      screen.getByTestId("recommended-automation-card-github-pr-reviewer"),
    );
    await screen.findByTestId("mcp-install-modal");

    fireEvent.change(
      screen.getByTestId("mcp-install-field-GITHUB_PERSONAL_ACCESS_TOKEN"),
      {
        target: { value: "github-token" },
      },
    );
    fireEvent.click(screen.getByTestId("mcp-install-submit"));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockCreateConversationMutate).toHaveBeenCalledTimes(1),
    );
  });
});

describe("buildAutomationPrompt", () => {
  const basePrompt = "Create an automation that does something useful.";

  it("appends local API instructions for local backends without cloud endpoints", () => {
    const result = buildAutomationPrompt(basePrompt, "local");
    expect(result).toContain(basePrompt);
    expect(result).toContain("local");
    expect(result).toContain("<RUNTIME_SERVICES>");
    expect(result).toContain("$OPENHANDS_AUTOMATION_API_KEY");
    expect(result).toContain("/api/automation/v1/preset/prompt");
    expect(result).not.toContain("app.all-hands.dev");
    expect(result).not.toContain("$OPENHANDS_API_KEY");
    expect(result).toContain("instead of using any remote/cloud automation API");
  });

  it("appends cloud API instructions for cloud backends", () => {
    const result = buildAutomationPrompt(basePrompt, "cloud");
    expect(result).toContain(basePrompt);
    expect(result).toContain("app.all-hands.dev");
    expect(result).toContain("$OPENHANDS_API_KEY");
    expect(result).toContain("/api/automation/v1/preset/prompt");
    expect(result).not.toContain("<RUNTIME_SERVICES>");
    expect(result).not.toContain("$OPENHANDS_AUTOMATION_API_KEY");
  });

  it("keeps the original prompt text verbatim at the start", () => {
    const localResult = buildAutomationPrompt(basePrompt, "local");
    const cloudResult = buildAutomationPrompt(basePrompt, "cloud");
    expect(localResult.startsWith(basePrompt)).toBe(true);
    expect(cloudResult.startsWith(basePrompt)).toBe(true);
  });
});
