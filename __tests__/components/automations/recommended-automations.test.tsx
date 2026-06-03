import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsService from "#/api/settings-service/settings-service.api";
import McpService from "#/api/mcp-service/mcp-service.api";
import { getConversationState } from "#/utils/conversation-local-storage";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import type { Backend } from "#/api/backend-registry/types";
import {
  RecommendedAutomationsLauncher,
  buildAutomationPrompt,
} from "#/components/features/automations/recommended-automations-launcher";
import {
  RecommendedAutomationsSection,
  getAutomationsByPopularity,
} from "#/components/features/automations/recommended-automations-section";
import {
  AUTOMATION_CATALOG,
  type RecommendedAutomation,
} from "@openhands/extensions/automations";
import { useAutomationPreferencesStore } from "#/stores/automation-preferences-store";

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
  // Minimal stub: render the key so components using <Trans> don't crash.
  Trans: ({ i18nKey }: { i18nKey?: string }) => i18nKey ?? null,
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

const localBackend: Backend = {
  id: "local-backend",
  name: "Local",
  host: "http://localhost:8000",
  apiKey: "",
  kind: "local",
};

const cloudBackend: Backend = {
  id: "cloud-backend",
  name: "Cloud",
  host: "https://staging.all-hands.dev/",
  apiKey: "cloud-token",
  kind: "cloud",
};

function renderLauncher({ withBackendProvider = false } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const launcher = <RecommendedAutomationsLauncher />;

  return render(
    <QueryClientProvider client={queryClient}>
      {withBackendProvider ? (
        <ActiveBackendProvider>{launcher}</ActiveBackendProvider>
      ) : (
        launcher
      )}
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

function settingsWithGithubMcp() {
  return settingsWithMcpConfig({
    mcpServers: {
      github: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: "github-token" },
      },
    },
  });
}

describe("recommended automations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // The persisted preferences store is a module singleton — reset its
    // in-memory state so a "don't show again" set in one test doesn't leak.
    useAutomationPreferencesStore.setState({
      hideResponderDeploymentChoice: false,
    });
    __resetActiveStoreForTests();
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });
    mockUseSettings.mockReturnValue({
      data: settingsWithMcpConfig({ mcpServers: {} }),
    });
    // Pre-flight connectivity test must pass so save mutations are reached.
    vi.spyOn(McpService, "testServer").mockResolvedValue({
      ok: true,
      tools: [],
    });
  });

  afterEach(() => {
    localStorage.clear();
    __resetActiveStoreForTests();
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
      "recommended-automation-card-github-repo-monitor",
    );
    expect(cards[2]).toHaveAttribute(
      "data-testid",
      "recommended-automation-card-slack-standup-digest",
    );
    expect(cards[3]).toHaveAttribute(
      "data-testid",
      "recommended-automation-card-slack-channel-monitor",
    );
  });

  it("sorts recommendation popularity deterministically when ranks are missing or tied", () => {
    const makeAutomation = (
      id: string,
      popularityRank?: number,
    ): RecommendedAutomation =>
      ({
        ...AUTOMATION_CATALOG[0],
        id,
        popularityRank,
      }) as RecommendedAutomation;

    expect(
      getAutomationsByPopularity([
        makeAutomation("missing-first"),
        makeAutomation("tie-a", 10),
        makeAutomation("top", 20),
        makeAutomation("tie-b", 10),
        makeAutomation("missing-second"),
      ]).map((automation) => automation.id),
    ).toEqual(["top", "tie-a", "tie-b", "missing-first", "missing-second"]);
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

  it("shows a left-aligned MCP icon stack on each card", () => {
    render(
      <RecommendedAutomationsSection
        backendKind="local"
        installedServers={[]}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("recommended-automation-icon-github-pr-reviewer"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("recommended-automation-icon-research-brief-writer"),
    ).toHaveAttribute("data-layout", "overlap");
    expect(
      screen.getByTestId(
        "recommended-automation-icon-incident-retrospective-drafter",
      ),
    ).toHaveAttribute("data-layout", "quadrants");
  });

  it("renders missing MCP connect copy as a pill on the same row", () => {
    const offsetWidthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetWidth",
    );
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return 120;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 2000;
      },
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}

        unobserve() {}

        disconnect() {}
      },
    );

    try {
      render(
        <RecommendedAutomationsSection
          backendKind="local"
          installedServers={[]}
          onSelect={vi.fn()}
        />,
      );

      const pillRow = screen.getByTestId(
        "recommended-automation-pills-research-brief-writer",
      );
      expect(pillRow).toHaveTextContent(
        "RECOMMENDED_AUTOMATIONS$MISSING_CONNECT:2",
      );
      expect(pillRow).toHaveClass("flex-nowrap");
      expect(pillRow).not.toHaveClass("flex-wrap");
    } finally {
      if (offsetWidthDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "offsetWidth",
          offsetWidthDescriptor,
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
      }
      Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
      vi.unstubAllGlobals();
    }
  });

  it("shows a decorative plus badge on each card without toggle behavior", () => {
    render(
      <RecommendedAutomationsSection
        backendKind="local"
        installedServers={[]}
        onSelect={vi.fn()}
      />,
    );

    const plusBadge = screen.getByTestId(
      "recommended-automation-plus-github-pr-reviewer",
    );
    expect(plusBadge.tagName).toBe("SPAN");
    expect(plusBadge).toHaveAttribute("aria-hidden", "true");
    expect(plusBadge.className).toContain(
      "hover:bg-[var(--oh-interactive-hover)]",
    );
    expect(plusBadge.querySelector('[role="switch"]')).not.toBeInTheDocument();
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
    // GitHub responders first prompt for a runtime choice.
    fireEvent.click(screen.getByTestId("deployment-choice-local"));

    const modal = await screen.findByTestId("mcp-install-modal");
    expect(modal).toHaveAttribute("data-marketplace-id", "github");
    expect(
      screen.getByTestId("mcp-install-field-command-readonly"),
    ).toHaveValue(
      "docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server",
    );
    expect(
      screen.getByTestId("mcp-install-field-GITHUB_PERSONAL_ACCESS_TOKEN"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("mcp-install-field-url")).toBeNull();
    expect(screen.queryByTestId("mcp-install-field-api_key")).toBeNull();
    expect(mockCreateConversationMutate).not.toHaveBeenCalled();
  });

  it("launches directly with local automation API instructions when the required MCP is already installed", () => {
    mockUseSettings.mockReturnValue({
      data: settingsWithGithubMcp(),
    });

    renderLauncher();

    fireEvent.click(
      screen.getByTestId("recommended-automation-card-github-pr-reviewer"),
    );
    fireEvent.click(screen.getByTestId("deployment-choice-local"));

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

  it("ignores repeated card clicks while a recommendation launch is in flight", () => {
    mockUseSettings.mockReturnValue({
      data: settingsWithGithubMcp(),
    });

    renderLauncher();

    const card = screen.getByTestId(
      "recommended-automation-card-github-pr-reviewer",
    );
    fireEvent.click(card);
    fireEvent.click(screen.getByTestId("deployment-choice-local"));
    // Launch is now in flight; clicking the card again must not relaunch.
    fireEvent.click(card);

    expect(mockCreateConversationMutate).toHaveBeenCalledTimes(1);
  });

  it("hides the recommended automations section on cloud backends", () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    renderLauncher({ withBackendProvider: true });

    expect(
      screen.queryByTestId("recommended-automations-section"),
    ).not.toBeInTheDocument();
  });

  it("prompts for a runtime choice before launching a GitHub/Slack responder", () => {
    mockUseSettings.mockReturnValue({
      data: settingsWithGithubMcp(),
    });

    renderLauncher();

    fireEvent.click(
      screen.getByTestId("recommended-automation-card-github-pr-reviewer"),
    );

    // The deployment-choice modal gates the launch — nothing happens yet.
    expect(screen.getByTestId("deployment-choice-modal")).toBeInTheDocument();
    expect(mockCreateConversationMutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("mcp-install-modal")).not.toBeInTheDocument();
  });

  it("persists 'Don't show this again' and skips the modal next time", () => {
    mockUseSettings.mockReturnValue({
      data: settingsWithGithubMcp(),
    });

    const { unmount } = renderLauncher();

    fireEvent.click(
      screen.getByTestId("recommended-automation-card-github-pr-reviewer"),
    );
    expect(screen.getByTestId("deployment-choice-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("deployment-choice-dont-show-again"));
    expect(
      useAutomationPreferencesStore.getState().hideResponderDeploymentChoice,
    ).toBe(true);

    fireEvent.click(screen.getByTestId("deployment-choice-local"));
    expect(mockCreateConversationMutate).toHaveBeenCalledTimes(1);

    // A fresh launcher mount now bypasses the modal and launches directly.
    unmount();
    renderLauncher();

    fireEvent.click(
      screen.getByTestId("recommended-automation-card-github-repo-monitor"),
    );

    expect(
      screen.queryByTestId("deployment-choice-modal"),
    ).not.toBeInTheDocument();
    expect(mockCreateConversationMutate).toHaveBeenCalledTimes(2);
  });

  it("links the cloud option to OpenHands Cloud integrations and dismisses on click", () => {
    renderLauncher();

    fireEvent.click(
      screen.getByTestId("recommended-automation-card-github-pr-reviewer"),
    );

    const cloudLink = screen.getByTestId("deployment-choice-cloud");
    expect(cloudLink).toHaveAttribute(
      "href",
      "https://app.all-hands.dev/settings/integrations",
    );
    expect(cloudLink).toHaveAttribute("target", "_blank");

    fireEvent.click(cloudLink);

    // Choosing cloud does not start a local conversation and closes the modal.
    expect(mockCreateConversationMutate).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("deployment-choice-modal"),
    ).not.toBeInTheDocument();
  });

  it("launches the recommendation after the missing MCP is installed", async () => {
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderLauncher();

    fireEvent.click(
      screen.getByTestId("recommended-automation-card-github-pr-reviewer"),
    );
    fireEvent.click(screen.getByTestId("deployment-choice-local"));
    await screen.findByTestId("mcp-install-modal");

    fireEvent.change(
      screen.getByTestId("mcp-install-field-GITHUB_PERSONAL_ACCESS_TOKEN"),
      { target: { value: "github-token" } },
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
    expect(result).toContain(
      "instead of using any remote/cloud automation API",
    );
  });

  it("appends cloud API instructions for the active cloud backend", () => {
    const result = buildAutomationPrompt(
      basePrompt,
      "cloud",
      "https://staging.all-hands.dev/",
    );
    expect(result).toContain(basePrompt);
    expect(result).toContain(
      "https://staging.all-hands.dev/api/automation/v1/preset/prompt",
    );
    expect(result).not.toContain("https://staging.all-hands.dev//api");
    expect(result).not.toContain("app.all-hands.dev");
    expect(result).toContain("$OPENHANDS_API_KEY");
    expect(result).toContain("/api/automation/v1/preset/prompt");
    expect(result).not.toContain("<RUNTIME_SERVICES>");
    expect(result).not.toContain("$OPENHANDS_AUTOMATION_API_KEY");
  });

  it("keeps the original prompt text verbatim at the start", () => {
    const localResult = buildAutomationPrompt(basePrompt, "local");
    const cloudResult = buildAutomationPrompt(
      basePrompt,
      "cloud",
      "https://staging.all-hands.dev",
    );
    expect(localResult.startsWith(basePrompt)).toBe(true);
    expect(cloudResult.startsWith(basePrompt)).toBe(true);
  });
});
