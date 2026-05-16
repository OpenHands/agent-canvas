import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { HomeChatLauncher } from "#/components/features/home/home-chat-launcher";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";

const mockNavigate = vi.fn();
const mockUseActiveBackend = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({
    currentPath: "/",
    conversationId: null,
    isNavigating: false,
    navigate: mockNavigate,
  }),
}));

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => mockUseActiveBackend(),
}));

vi.mock("#/hooks/use-is-creating-conversation", () => ({
  useIsCreatingConversation: () => false,
}));

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackConversationCreated: vi.fn(),
  }),
}));

// Stub CustomChatInput as a simple button so the test can submit without
// exercising the rich contenteditable / draft-persistence stack — those are
// covered by their own unit tests. Pressing the stub button is the same
// signal: "user submitted `hello world`".
vi.mock("#/components/features/chat/custom-chat-input", () => ({
  CustomChatInput: ({
    onSubmit,
    disabled,
  }: {
    onSubmit: (msg: string) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      data-testid="stub-chat-submit"
      disabled={disabled}
      onClick={() => onSubmit("hello world")}
    >
      stub submit
    </button>
  ),
}));

// Stub the selection dialogs. We mirror the real component's contract:
// `onConfirm(selection)` is followed by `onClose()` so the parent's pending
// state is set and the dialog disappears.
vi.mock("#/components/features/home/open-workspace-dialog", () => ({
  OpenWorkspaceDialog: ({
    isOpen,
    onClose,
    onConfirm,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (w: { id: string; name: string; path: string }) => void;
  }) =>
    isOpen ? (
      <button
        type="button"
        data-testid="stub-workspace-dialog-confirm"
        onClick={() => {
          onConfirm({ id: "/p/app", name: "app", path: "/p/app" });
          onClose();
        }}
      >
        confirm
      </button>
    ) : null,
}));

vi.mock("#/components/features/home/open-repository-dialog", () => ({
  OpenRepositoryDialog: ({
    isOpen,
    onClose,
    onConfirm,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (s: {
      repository: {
        id: string;
        full_name: string;
        git_provider: "github";
        is_public: boolean;
      };
      branch: { name: string };
      provider: "github" | null;
    }) => void;
  }) =>
    isOpen ? (
      <button
        type="button"
        data-testid="stub-repo-dialog-confirm"
        onClick={() => {
          onConfirm({
            repository: {
              id: "1",
              full_name: "org/repo",
              git_provider: "github",
              is_public: true,
            },
            branch: { name: "main" },
            provider: "github",
          });
          onClose();
        }}
      >
        confirm
      </button>
    ) : null,
}));

// HomeGitControlBarPreview pulls in settings + provider hooks we don't care
// about for these tests. It's purely presentational once a selection is
// confirmed, so a thin stub is sufficient.
vi.mock("#/components/features/home/home-git-control-bar-preview", () => ({
  HomeGitControlBarPreview: () => (
    <div data-testid="stub-git-control-bar-preview" />
  ),
}));

const renderLauncher = () =>
  render(<HomeChatLauncher />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        {children}
      </QueryClientProvider>
    ),
  });

function makeConversationResponse(
  overrides: Record<string, unknown> = {},
): never {
  return {
    id: "conv-abc",
    created_by_user_id: null,
    status: "READY",
    detail: null,
    app_conversation_id: "conv-abc",
    agent_server_url: "http://agent-server.local",
    request: { initial_message: undefined, plugins: null },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as never;
}

const localBackend = {
  backend: {
    id: "local-id",
    name: "Local",
    host: "http://localhost",
    apiKey: "test",
    kind: "local" as const,
  },
  orgId: null,
};

const cloudBackend = {
  backend: {
    id: "cloud-id",
    name: "Cloud",
    host: "https://cloud",
    apiKey: "test",
    kind: "cloud" as const,
  },
  orgId: null,
};

describe("HomeChatLauncher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActiveBackend.mockReturnValue(localBackend);
  });

  afterEach(() => {
    toast.remove();
  });

  it("creates a conversation with just the typed query and navigates when no workspace is selected", async () => {
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue(makeConversationResponse());

    renderLauncher();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("stub-chat-submit"));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith(
      "hello world",
      undefined,
      undefined,
      null,
      undefined,
      undefined,
      undefined,
    );
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/conversations/conv-abc"),
    );
  });

  it("passes the picked workspace path as working_dir on a local backend", async () => {
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue(
        makeConversationResponse({ app_conversation_id: "conv-ws" }),
      );

    renderLauncher();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("open-workspace-button"));
    await user.click(await screen.findByTestId("stub-workspace-dialog-confirm"));
    await user.click(screen.getByTestId("stub-chat-submit"));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith(
      "hello world",
      undefined,
      undefined,
      null,
      "/p/app",
      undefined,
      undefined,
    );
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/conversations/conv-ws"),
    );
  });

  it("passes the picked repository + branch payload on a cloud backend", async () => {
    mockUseActiveBackend.mockReturnValue(cloudBackend);
    const createSpy = vi
      .spyOn(AgentServerConversationService, "createConversation")
      .mockResolvedValue(
        makeConversationResponse({ app_conversation_id: "conv-repo" }),
      );

    renderLauncher();
    const user = userEvent.setup();

    await user.click(screen.getByTestId("open-repository-button"));
    await user.click(await screen.findByTestId("stub-repo-dialog-confirm"));
    await user.click(screen.getByTestId("stub-chat-submit"));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith(
      "hello world",
      undefined,
      undefined,
      {
        selected_repository: "org/repo",
        selected_branch: "main",
        git_provider: "github",
      },
      undefined,
      undefined,
      undefined,
    );
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/conversations/conv-repo"),
    );
  });

  it("surfaces a toast and skips navigation when conversation creation fails", async () => {
    const toastErrorSpy = vi.spyOn(toast, "error");
    vi.spyOn(AgentServerConversationService, "createConversation").mockRejectedValue(
      new Error("Network down"),
    );

    renderLauncher();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("stub-chat-submit"));

    await waitFor(() => expect(toastErrorSpy).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
