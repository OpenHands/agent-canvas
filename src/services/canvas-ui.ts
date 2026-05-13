import {
  ConversationTab,
  useConversationStore,
} from "#/stores/conversation-store";
import { useFilesTabStore } from "#/stores/files-tab-store";

const VALID_TABS: ReadonlySet<ConversationTab> = new Set<ConversationTab>([
  "files",
  "browser",
  "vscode",
  "terminal",
  "planner",
  "tasklist",
]);

export interface CanvasUIActionPayload {
  command: "navigate_to_file" | "open_tab" | "show_preview";
  path?: string | null;
  tab?: string | null;
}

// Mirrors src/hooks/use-select-conversation-tab.ts so a non-React caller (the
// WebSocket dispatch) gets the same "reveal the right panel if collapsed"
// behavior as in-app tab switches.
function navigateToTab(tab: ConversationTab) {
  const store = useConversationStore.getState();
  store.setSelectedTab(tab);
  if (!store.isRightPanelShown) {
    store.setHasRightPanelToggled(true);
    store.setIsRightPanelShown(true);
  }
}

function isValidTab(value: string): value is ConversationTab {
  return VALID_TABS.has(value as ConversationTab);
}

export function handleCanvasUIAction(action: CanvasUIActionPayload): void {
  switch (action.command) {
    case "navigate_to_file":
    case "show_preview":
      navigateToTab("files");
      if (action.path) {
        useFilesTabStore.getState().setSelectedPath(action.path);
      }
      return;
    case "open_tab":
      if (action.tab && isValidTab(action.tab)) {
        navigateToTab(action.tab);
      }
      return;
  }
}
