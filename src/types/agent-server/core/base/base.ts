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
  // Legacy Python-defined Canvas tool kind. New conversations emit
  // ClientAction_canvas_ui_client through the SDK's client_tools API.
  | "CanvasUI";

type ObservationOnlyType = "Browser";

type ActionEventType =
  | `${ActionOnlyType}Action`
  | `${EventType}Action`
  | "GlobAction"
  | "GrepAction"
  // The `task` tool delegating work to a spawned subagent.
  | "TaskAction"
  | "ClientAction_canvas_ui_client";
type ObservationEventType =
  | `${ObservationOnlyType}Observation`
  | `${EventType}Observation`
  | "TerminalObservation"
  | "GlobObservation"
  | "GrepObservation"
  // Result of the `task` tool, which delegates work to a spawned subagent.
  | "TaskObservation"
  // Legacy and client-defined acknowledgements for Canvas UI dispatches.
  | "CanvasUIObservation"
  | "ClientToolObservation";

export interface ActionBase<T extends ActionEventType = ActionEventType> {
  kind: T;
}

export interface ObservationBase<
  T extends ObservationEventType = ObservationEventType,
> {
  kind: T;
}
