import { beforeEach, describe, expect, it } from "vitest";

import { handleCanvasUIAction } from "#/services/canvas-ui";
import { useConversationStore } from "#/stores/conversation-store";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { isCanvasUIActionEvent } from "#/types/agent-server/type-guards";

describe("handleCanvasUIAction", () => {
  beforeEach(() => {
    // Arrange (shared): collapsed right panel, no selected file. Lets us
    // observe both the tab/panel toggling and the path mutation that the
    // dispatcher performs.
    useConversationStore.setState({
      selectedTab: null,
      isRightPanelShown: false,
      hasRightPanelToggled: false,
    });
    useFilesTabStore.setState({ selectedPath: null });
  });

  it("navigate_to_file selects the files tab, reveals the panel, and sets selectedPath", () => {
    handleCanvasUIAction({
      command: "navigate_to_file",
      path: "docs/intro.html",
    });

    const conv = useConversationStore.getState();
    expect(conv.selectedTab).toBe("files");
    expect(conv.isRightPanelShown).toBe(true);
    expect(useFilesTabStore.getState().selectedPath).toBe("docs/intro.html");
  });

  it("show_preview selects the files tab and the requested path", () => {
    handleCanvasUIAction({
      command: "show_preview",
      path: "report.html",
    });

    expect(useConversationStore.getState().selectedTab).toBe("files");
    expect(useFilesTabStore.getState().selectedPath).toBe("report.html");
  });

  it("open_tab switches to a valid tab without touching selectedPath", () => {
    handleCanvasUIAction({ command: "open_tab", tab: "terminal" });

    expect(useConversationStore.getState().selectedTab).toBe("terminal");
    expect(useFilesTabStore.getState().selectedPath).toBeNull();
  });

  it("open_tab ignores unknown tab values", () => {
    handleCanvasUIAction({ command: "open_tab", tab: "not_a_tab" });

    expect(useConversationStore.getState().selectedTab).toBeNull();
    expect(useConversationStore.getState().isRightPanelShown).toBe(false);
  });

  it("navigate_to_file leaves selectedPath alone when no path is supplied", () => {
    useFilesTabStore.setState({ selectedPath: "previous.txt" });

    handleCanvasUIAction({ command: "navigate_to_file", path: null });

    expect(useFilesTabStore.getState().selectedPath).toBe("previous.txt");
    expect(useConversationStore.getState().selectedTab).toBe("files");
  });
});

describe("isCanvasUIActionEvent", () => {
  function makeActionEvent(overrides: Record<string, unknown> = {}) {
    return {
      id: "evt-1",
      timestamp: "2026-05-13T00:00:00Z",
      source: "agent",
      action: { kind: "CanvasUIAction" },
      tool_name: "canvas_ui",
      tool_call_id: "call-1",
      ...overrides,
    };
  }

  it("returns true for an ActionEvent whose tool_name is canvas_ui", () => {
    expect(isCanvasUIActionEvent(makeActionEvent() as never)).toBe(true);
  });

  it("returns false when tool_name belongs to a different tool", () => {
    expect(
      isCanvasUIActionEvent(
        makeActionEvent({ tool_name: "execute_bash" }) as never,
      ),
    ).toBe(false);
  });

  it("returns false for a non-action event (no action field)", () => {
    const observationEvent = {
      id: "evt-2",
      timestamp: "2026-05-13T00:00:00Z",
      source: "environment",
      observation: { kind: "ExecuteBashObservation" },
      tool_name: "canvas_ui",
      tool_call_id: "call-1",
    };

    expect(isCanvasUIActionEvent(observationEvent as never)).toBe(false);
  });
});
