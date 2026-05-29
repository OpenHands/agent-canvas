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
  | "GrepAction";
type ObservationEventType =
  | `${ObservationOnlyType}Observation`
  | `${EventType}Observation`
  | "TerminalObservation"
  | "GlobObservation"
  | "GrepObservation";

export interface ActionBase<T extends ActionEventType = ActionEventType> {
  kind: T;
}

export interface ObservationBase<
  T extends ObservationEventType = ObservationEventType,
> {
  kind: T;
}
