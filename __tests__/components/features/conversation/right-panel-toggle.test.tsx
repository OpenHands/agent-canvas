import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RightPanelToggle } from "#/components/features/conversation/right-panel-toggle";
import { useConversationStore } from "#/stores/conversation-store";

const CONVERSATION_ID = "conv-abc123";

vi.mock("#/hooks/use-conversation-id", () => ({
  useConversationId: () => ({ conversationId: CONVERSATION_ID }),
}));

describe("RightPanelToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    useConversationStore.setState({
      selectedTab: "files",
      isRightPanelShown: true,
      hasRightPanelToggled: true,
    });
  });

  it("should render the toggle button", () => {
    render(<RightPanelToggle />);
    expect(screen.getByTestId("right-panel-toggle")).toBeInTheDocument();
  });

  it("should hide the panel when clicked while panel is open", async () => {
    const user = userEvent.setup();

    render(<RightPanelToggle />);

    const button = screen.getByTestId("right-panel-toggle");
    await user.click(button);

    const storeState = useConversationStore.getState();
    expect(storeState.hasRightPanelToggled).toBe(false);

    // The drawer's open/closed state is session-only — the toggle must
    // not write a `rightPanelShown` field into the persisted blob.
    const raw = localStorage.getItem(`conversation-state-${CONVERSATION_ID}`);
    if (raw !== null) {
      expect(JSON.parse(raw)).not.toHaveProperty("rightPanelShown");
    }
  });

  it("should show the panel when clicked while panel is hidden", async () => {
    const user = userEvent.setup();

    useConversationStore.setState({
      isRightPanelShown: false,
      hasRightPanelToggled: false,
    });

    render(<RightPanelToggle />);

    const button = screen.getByTestId("right-panel-toggle");
    await user.click(button);

    const storeState = useConversationStore.getState();
    expect(storeState.hasRightPanelToggled).toBe(true);

    const raw = localStorage.getItem(`conversation-state-${CONVERSATION_ID}`);
    if (raw !== null) {
      expect(JSON.parse(raw)).not.toHaveProperty("rightPanelShown");
    }
  });

  it("should have aria-pressed attribute reflecting panel state", () => {
    const { unmount } = render(<RightPanelToggle />);
    expect(screen.getByTestId("right-panel-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    unmount();

    useConversationStore.setState({ isRightPanelShown: false });
    render(<RightPanelToggle />);
    expect(screen.getByTestId("right-panel-toggle")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
