import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import VSCodeTab from "#/routes/vscode-tab";
import { useUnifiedVSCodeUrl } from "#/hooks/query/use-unified-vscode-url";
import { useAgentState } from "#/hooks/use-agent-state";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { AgentState } from "#/types/agent-state";
import type { ResolvedActiveBackend } from "#/api/backend-registry/types";

vi.mock("#/hooks/query/use-unified-vscode-url");
vi.mock("#/hooks/use-agent-state");
vi.mock("#/contexts/active-backend-context");
vi.mock("#/utils/feature-flags", () => ({
  VSCODE_IN_NEW_TAB: () => false,
}));

function mockVSCodeUrlHook(
  value: Partial<ReturnType<typeof useUnifiedVSCodeUrl>>,
) {
  vi.mocked(useUnifiedVSCodeUrl).mockReturnValue({
    data: { url: "http://localhost:3000/vscode", error: null },
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: true,
    status: "success",
    refetch: vi.fn(),
    ...value,
  } as ReturnType<typeof useUnifiedVSCodeUrl>);
}

function mockBackend(kind: "local" | "cloud") {
  vi.mocked(useActiveBackend).mockReturnValue({
    backend: {
      id: `${kind}-test`,
      name: `${kind} test`,
      host: kind === "cloud" ? "https://app.example.com" : "http://localhost:8000",
      apiKey: kind === "cloud" ? "secret" : "",
      kind,
    },
    orgId: null,
  } as ResolvedActiveBackend);
}

describe("VSCodeTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBackend("cloud");
  });

  it("keeps VSCode accessible when the agent is in an error state", () => {
    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.ERROR,
    });
    mockVSCodeUrlHook({});

    renderWithProviders(<VSCodeTab />);

    expect(
      screen.queryByText("DIFF_VIEWER$WAITING_FOR_RUNTIME"),
    ).not.toBeInTheDocument();
    expect(screen.getByTitle("VSCODE$TITLE")).toHaveAttribute(
      "src",
      "http://localhost:3000/vscode",
    );
  });

  it("still waits while the runtime is starting", () => {
    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.LOADING,
    });
    mockVSCodeUrlHook({});

    renderWithProviders(<VSCodeTab />);

    expect(
      screen.getByText("DIFF_VIEWER$WAITING_FOR_RUNTIME"),
    ).toBeInTheDocument();
    expect(screen.queryByTitle("VSCODE$TITLE")).not.toBeInTheDocument();
  });

  it("shows not-configured guidance for local backends when VS Code is unavailable", () => {
    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.AWAITING_USER_INPUT,
    });
    mockBackend("local");
    mockVSCodeUrlHook({
      data: undefined,
      error: new Error("VS Code not available"),
      isError: true,
      isSuccess: false,
      status: "error",
    });

    renderWithProviders(<VSCodeTab />);

    expect(screen.getByTestId("vscode-not-configured")).toBeInTheDocument();
    expect(screen.getByText("VSCODE$NOT_CONFIGURED_TITLE")).toBeInTheDocument();
    expect(
      screen.getByText("VSCODE$NOT_CONFIGURED_MESSAGE"),
    ).toBeInTheDocument();
    expect(screen.getByText("VSCODE$SETUP_PROMPT")).toBeInTheDocument();
  });

  it("renders a copy button that copies the setup prompt to clipboard", async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.AWAITING_USER_INPUT,
    });
    mockBackend("local");
    mockVSCodeUrlHook({
      data: undefined,
      error: new Error("VS Code not available"),
      isError: true,
      isSuccess: false,
      status: "error",
    });

    renderWithProviders(<VSCodeTab />);

    const copyButton = screen.getByRole("button", {
      name: "VSCODE$COPY_PROMPT",
    });
    await user.click(copyButton);

    expect(writeTextMock).toHaveBeenCalledWith("VSCODE$SETUP_PROMPT");
  });

  it("shows generic error for cloud backends when VS Code URL is unavailable", () => {
    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.AWAITING_USER_INPUT,
    });
    mockBackend("cloud");
    mockVSCodeUrlHook({
      data: { url: null, error: "VSCODE$URL_NOT_AVAILABLE" },
      error: null,
      isError: false,
      isSuccess: true,
      status: "success",
    });

    renderWithProviders(<VSCodeTab />);

    expect(
      screen.queryByTestId("vscode-not-configured"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("VSCODE$URL_NOT_AVAILABLE")).toBeInTheDocument();
  });

  it("shows VS Code iframe for local backends when URL is available", () => {
    vi.mocked(useAgentState).mockReturnValue({
      curAgentState: AgentState.AWAITING_USER_INPUT,
    });
    mockBackend("local");
    mockVSCodeUrlHook({
      data: { url: "http://localhost:8001", error: null },
    });

    renderWithProviders(<VSCodeTab />);

    expect(
      screen.queryByTestId("vscode-not-configured"),
    ).not.toBeInTheDocument();
    expect(screen.getByTitle("VSCODE$TITLE")).toHaveAttribute(
      "src",
      "http://localhost:8001",
    );
  });
});
