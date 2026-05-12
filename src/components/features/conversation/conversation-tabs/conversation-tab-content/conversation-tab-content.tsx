import { lazy, useMemo, Suspense } from "react";
import { ConversationLoading } from "../../conversation-loading";
import { TabWrapper } from "./tab-wrapper";
import { TabContainer } from "./tab-container";
import { TabContentArea } from "./tab-content-area";
import { useConversationStore } from "#/stores/conversation-store";
import { useConversationId } from "#/hooks/use-conversation-id";

// Lazy load all tab components, including the terminal — xterm + addon-fit +
// xterm.css are large enough that we don't want them in the conversation
// route's eager graph just because the terminal tab might be selected later.
const FilesTab = lazy(() => import("#/routes/files-tab"));
const BrowserTab = lazy(() => import("#/routes/browser-tab"));
const VSCodeTab = lazy(() => import("#/routes/vscode-tab"));
const PlannerTab = lazy(() => import("#/routes/planner-tab"));
const TaskListTab = lazy(() => import("#/routes/task-list-tab"));
const Terminal = lazy(() => import("#/components/features/terminal/terminal"));

const TAB_CONFIG = {
  tasklist: { component: TaskListTab },
  files: { component: FilesTab },
  browser: { component: BrowserTab },
  vscode: { component: VSCodeTab },
  terminal: { component: Terminal },
  planner: { component: PlannerTab },
};

export function ConversationTabContent() {
  const { selectedTab, shouldShownAgentLoading } = useConversationStore();
  const { conversationId } = useConversationId();

  const activeTab = useMemo(
    () =>
      TAB_CONFIG[selectedTab as keyof typeof TAB_CONFIG] ?? TAB_CONFIG.files,
    [selectedTab],
  );

  const ActiveComponent = activeTab.component;

  if (shouldShownAgentLoading) {
    return <ConversationLoading />;
  }

  return (
    <TabContainer>
      <Suspense fallback={<ConversationLoading />}>
        <TabContentArea>
          <TabWrapper
            // Force Terminal remount to reset XTerm buffer/state
            key={
              selectedTab === "terminal"
                ? `${selectedTab}-${conversationId}`
                : selectedTab
            }
          >
            <ActiveComponent />
          </TabWrapper>
        </TabContentArea>
      </Suspense>
    </TabContainer>
  );
}
