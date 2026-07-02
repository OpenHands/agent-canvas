import { I18nKey } from "#/i18n/declaration";
import type { AppConversationStartTaskStatus } from "#/api/conversation-service/agent-server-conversation-service.types";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { WebSocketConnectionState } from "#/contexts/conversation-websocket-context";
import { ConversationStatus } from "#/types/conversation-status";
import { AgentState } from "#/types/agent-state";
import {
  OH_STATUS_ERROR_COLOR,
  OH_STATUS_SUCCESS_COLOR,
} from "#/constants/status-colors";

const ACTIVE_EXECUTION_STATUSES: ReadonlySet<ExecutionStatus> = new Set([
  ExecutionStatus.IDLE,
  ExecutionStatus.RUNNING,
  ExecutionStatus.WAITING_FOR_CONFIRMATION,
  ExecutionStatus.FINISHED,
]);

export function isExecutionActive(
  status: ExecutionStatus | null | undefined,
): boolean {
  return !!status && ACTIVE_EXECUTION_STATUSES.has(status);
}

export function isExecutionPaused(
  status: ExecutionStatus | null | undefined,
): boolean {
  return status === ExecutionStatus.PAUSED;
}

export function isExecutionErrored(
  status: ExecutionStatus | null | undefined,
): boolean {
  return status === ExecutionStatus.ERROR || status === ExecutionStatus.STUCK;
}

export function getTaskStatusI18nKey(
  taskStatus: AppConversationStartTaskStatus,
): I18nKey {
  switch (taskStatus) {
    case "WAITING_FOR_SANDBOX":
      return I18nKey.COMMON$WAITING_FOR_SANDBOX;
    case "SETTING_UP_GIT_HOOKS":
      return I18nKey.STATUS$SETTING_UP_GIT_HOOKS;
    case "SETTING_UP_SKILLS":
      return I18nKey.STATUS$SETTING_UP_SKILLS;
    // Terminal states map to their own localized keys so any caller that
    // delegates here (now or in the future) gets a correct label instead of
    // silently falling through to STARTING_CONVERSATION. Callers that need a
    // context-specific terminal label (e.g. getStatusCode's
    // AGENT_STATUS$ERROR_OCCURRED, or getStatusText's taskDetail precedence)
    // still handle these states before delegating.
    case "READY":
      return I18nKey.CONVERSATION$READY;
    case "ERROR":
      return I18nKey.COMMON$ERROR;
    // These collapse to the generic "Starting" label. `default` is unreachable
    // for the typed union but is kept as a runtime safety net: the start-task
    // API may report a new status before this enum is updated, in which case we
    // degrade to "Starting" rather than throwing (see FUTURE_STATUS_FROM_CLOUD).
    case "STARTING_CONVERSATION":
    case "WORKING":
    case "PREPARING_REPOSITORY":
    case "RUNNING_SETUP_SCRIPT":
    default:
      return I18nKey.CONVERSATION$STARTING_CONVERSATION;
  }
}

export function getStatusCode(
  webSocketConnectionState: WebSocketConnectionState,
  executionStatus: ExecutionStatus | null,
  taskStatus?: AppConversationStartTaskStatus | null,
  subConversationTaskStatus?: AppConversationStartTaskStatus | null,
) {
  if (
    taskStatus === "ERROR" ||
    subConversationTaskStatus === "ERROR" ||
    executionStatus === "error"
  ) {
    return I18nKey.AGENT_STATUS$ERROR_OCCURRED;
  }

  if (taskStatus && taskStatus !== "READY") {
    return getTaskStatusI18nKey(taskStatus);
  }

  if (executionStatus === ExecutionStatus.PAUSED) {
    return I18nKey.CHAT_INTERFACE$STOPPED;
  }

  // Websocket has disconnected...
  if (webSocketConnectionState && webSocketConnectionState !== "OPEN") {
    switch (webSocketConnectionState) {
      case "CLOSED":
      case "CLOSING":
        return I18nKey.CHAT_INTERFACE$DISCONNECTED;
      case "CONNECTING":
        return I18nKey.CHAT_INTERFACE$CONNECTING;
      default:
        throw new Error(
          `Unknown WebsocketConnectionState: ${webSocketConnectionState}`,
        );
    }
  }

  if (executionStatus && executionStatus !== ExecutionStatus.STUCK) {
    switch (executionStatus) {
      case ExecutionStatus.IDLE:
        return I18nKey.AGENT_STATUS$WAITING_FOR_TASK;
      case ExecutionStatus.RUNNING:
        return I18nKey.AGENT_STATUS$RUNNING_TASK;
      case ExecutionStatus.WAITING_FOR_CONFIRMATION:
        return I18nKey.AGENT_STATUS$WAITING_FOR_USER_CONFIRMATION;
      case ExecutionStatus.FINISHED:
        return I18nKey.CHAT_INTERFACE$AGENT_FINISHED_MESSAGE;
      default:
        throw new Error(`Unknown executionStatus: ${executionStatus}`);
    }
  }

  return I18nKey.CHAT_INTERFACE$AGENT_ERROR_MESSAGE;
}

/**
 * Get the label for a conversation status
 * @param status The conversation status
 * @returns The localized label for the status
 */
export const getConversationStatusLabel = (
  status: ConversationStatus,
): string => {
  switch (status) {
    case "STOPPED":
      return "COMMON$STOPPED";
    case "RUNNING":
      return "COMMON$RUNNING";
    case "STARTING":
      return "COMMON$STARTING";
    case "ERROR":
      return "COMMON$ERROR";
    case "ARCHIVED":
      return "COMMON$ARCHIVED"; // Use STOPPED for archived conversations
    default:
      return "COMMON$UNKNOWN";
  }
};

// Task Tracking Utility Functions

/**
 * Get the status icon for a task status
 * @param status The task status
 * @returns The emoji icon for the status
 */
export const getStatusIcon = (status: string) => {
  switch (status) {
    case "todo":
      return "⏳";
    case "in_progress":
      return "🔄";
    case "done":
      return "✅";
    default:
      return "❓";
  }
};

/**
 * Get the CSS class names for a task status badge
 * @param status The task status
 * @returns The CSS class names for styling the status badge
 */
export const getStatusClassName = (status: string) => {
  if (status === "done") {
    return "bg-green-800 text-green-200";
  }
  if (status === "in_progress") {
    return "bg-yellow-800 text-yellow-200";
  }
  return "bg-tertiary text-[var(--oh-text-tertiary)]";
};

/**
 * Check if a task is currently being polled (loading state)
 * @param taskStatus The task status string (e.g., "WORKING", "ERROR", "READY")
 * @returns True if the task is in a loading state (not ERROR and not READY)
 *
 * @example
 * isTaskPolling("WORKING") // Returns true
 * isTaskPolling("PREPARING_REPOSITORY") // Returns true
 * isTaskPolling("READY") // Returns false
 * isTaskPolling("ERROR") // Returns false
 * isTaskPolling(null) // Returns false
 * isTaskPolling(undefined) // Returns false
 */
export const isTaskPolling = (taskStatus: string | null | undefined): boolean =>
  !!taskStatus && taskStatus !== "ERROR" && taskStatus !== "READY";

/**
 * Get the appropriate color based on agent status
 * @param options Configuration object for status color calculation
 * @param options.isPausing Whether the agent is currently pausing
 * @param options.isTask Whether we're polling a task
 * @param options.taskStatus The task status string (e.g., "ERROR", "READY")
 * @param options.isStartingStatus Whether the agent is in a starting state (LOADING or INIT)
 * @param options.isStopStatus Whether the conversation status is STOPPED
 * @param options.curAgentState The current agent state
 * @returns The hex color code for the status
 *
 * @example
 * getStatusColor({
 *   isPausing: false,
 *   isTask: false,
 *   taskStatus: undefined,
 *   isStartingStatus: false,
 *   isStopStatus: false,
 *   curAgentState: AgentState.RUNNING
 * }) // Returns "var(--oh-status-success)"
 */
export const getStatusColor = (options: {
  isPausing: boolean;
  isTask: boolean;
  taskStatus?: string | null;
  isStartingStatus: boolean;
  isStopStatus: boolean;
  curAgentState: AgentState;
}): string => {
  const {
    isPausing,
    isTask,
    taskStatus,
    isStartingStatus,
    isStopStatus,
    curAgentState,
  } = options;

  // Show pausing status
  if (isPausing) {
    return "#FFD600";
  }

  // Show task status if we're polling a task
  if (isTask && taskStatus) {
    if (taskStatus === "ERROR") {
      return OH_STATUS_ERROR_COLOR;
    }
    return "#FFD600";
  }

  if (isStartingStatus) {
    return "#FFD600";
  }
  if (isStopStatus) {
    return "#ffffff";
  }
  if (curAgentState === AgentState.ERROR) {
    return OH_STATUS_ERROR_COLOR;
  }
  return OH_STATUS_SUCCESS_COLOR;
};

interface GetStatusTextArgs {
  isPausing: boolean;
  isTask: boolean;
  taskStatus?: AppConversationStartTaskStatus | null;
  taskDetail?: string | null;
  isStartingStatus: boolean;
  isStopStatus: boolean;
  curAgentState: AgentState;
  errorMessage?: string | null;
  t: (t: string) => string;
}

/**
 * Get the server status text based on agent and task state
 *
 * @param options Configuration object for status text calculation
 * @param options.isPausing Whether the agent is currently pausing
 * @param options.isTask Whether we're polling a task
 * @param options.taskStatus The task status string (e.g., "ERROR", "READY")
 * @param options.taskDetail Optional task-specific detail text
 * @param options.isStartingStatus Whether the conversation is in STARTING state
 * @param options.isStopStatus Whether the conversation is STOPPED
 * @param options.curAgentState The current agent state
 * @param options.errorMessage Optional agent error message
 * @returns Localized human-readable status text
 *
 * @example
 * getStatusText({
 *   isPausing: false,
 *   isTask: true,
 *   taskStatus: "STARTING_CONVERSATION",
 *   taskDetail: null,
 *   isStartingStatus: false,
 *   isStopStatus: false,
 *   curAgentState: AgentState.RUNNING
 * }) // Returns "Starting conversation"
 */
export function getStatusText({
  isPausing = false,
  isTask,
  taskStatus,
  taskDetail,
  isStartingStatus,
  isStopStatus,
  curAgentState,
  errorMessage,
  t,
}: GetStatusTextArgs): string {
  // Show pausing status
  if (isPausing) {
    return t(I18nKey.COMMON$STOPPING);
  }

  // Show task status if we're polling a task
  if (isTask && taskStatus) {
    if (taskStatus === "ERROR") {
      return taskDetail || t(I18nKey.CONVERSATION$ERROR_STARTING_CONVERSATION);
    }

    if (taskStatus === "READY") {
      return t(I18nKey.CONVERSATION$READY);
    }

    return taskDetail || t(getTaskStatusI18nKey(taskStatus));
  }

  if (isStartingStatus) {
    return t(I18nKey.COMMON$STARTING);
  }

  if (isStopStatus) {
    return t(I18nKey.COMMON$SERVER_STOPPED);
  }

  if (curAgentState === AgentState.ERROR) {
    return errorMessage || t(I18nKey.COMMON$ERROR);
  }

  return t(I18nKey.COMMON$RUNNING);
}
