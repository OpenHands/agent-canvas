import React from "react";
import { Outlet } from "react-router";
import { ConversationListPane } from "#/components/features/conversation-panel/conversation-list-pane";

const STORAGE_KEY = "agent-canvas-conversations-list-collapsed";

export default function ConversationsLayout() {
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      }
      return next;
    });
  };

  return (
    <div
      data-testid="conversations-layout"
      className="flex flex-row h-full w-full gap-3 min-h-0"
    >
      <ConversationListPane collapsed={collapsed} onToggle={handleToggle} />
      <div className="flex-1 min-w-0 h-full overflow-auto custom-scrollbar">
        <Outlet />
      </div>
    </div>
  );
}
