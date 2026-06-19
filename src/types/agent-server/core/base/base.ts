type EventType =
  | "MCPTool"
  | "Finish"
  | "Think"
  | "ExecuteBash"
  | "Terminal"
  | "FileEditor"
  | "StrReplaceEditor"
  | "TaskTracker"
  | "PlanningFileEditor"
  | "InvokeSkill"
  | "SwitchLLM";

type ActionOnlyType =
  | "BrowserNavigate"
  | "BrowserClick"
  | "BrowserType"
  | "BrowserGetState"
  | "BrowserGetContent"
  | "BrowserScroll"
  | "BrowserGoBack"
  | "BrowserListTabs"
  | "BrowserSwitchTab"
  | "BrowserCloseTab"
  // Frontend-injected custom tool. Not part of the upstream SDK Action
  // union but emitted as a regular ActionEvent over the WebSocket. See
  // tools/canvas_ui_tool.py and src/services/canvas-ui.ts.
  | "CanvasUI";

type ObservationOnlyType = "Browser";

type ActionEventType =
  | `${ActionOnlyType}Action`
  | `${EventType}Action`
  | "GlobAction"
  | "GrepAction"
  // The `task` tool delegating work to a spawned subagent.
  | "TaskAction";
type ObservationEventType =
  | `${ObservationOnlyType}Observation`
  | `${EventType}Observation`
  | "TerminalObservation"
  | "GlobObservation"
  | "GrepObservation"
  // Result of the `task` tool, which delegates work to a spawned subagent.
  | "TaskObservation"
  // Acknowledgement emitted after a `canvas_ui` command is dispatched.
  | "CanvasUIObservation";

export interface ActionBase<T extends ActionEventType = ActionEventType> {
  kind: T;
}

export interface ObservationBase<
  T extends ObservationEventType = ObservationEventType,
> {
  kind: T;
}
