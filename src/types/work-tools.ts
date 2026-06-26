import { isAgentServerToolAvailable } from "#/api/agent-server-compatibility";

/** Conversation tag storing comma-separated optional Work tool ids. */
export const WORK_ENABLED_TOOLS_TAG = "worktools";

/** Self-closing tag the agent emits to request an optional tool (see buildWorkSystemSuffix). */
export const WORK_TOOL_REQUEST_TAG = "WORK_TOOL_REQUEST";

export type WorkOptionalToolId = "browser";

export interface WorkOptionalToolDefinition {
  id: WorkOptionalToolId;
  agentToolName: string;
  /** i18n key for the toggle label */
  labelKey: string;
  /** i18n key for short description in setup */
  descriptionKey: string;
}

export const WORK_BASE_TOOL_NAMES = [
  "file_editor",
  "task_tracker",
  "canvas_ui",
] as const;

export const WORK_OPTIONAL_TOOLS: WorkOptionalToolDefinition[] = [
  {
    id: "browser",
    agentToolName: "browser_tool_set",
    labelKey: "WORK$TOOL_BROWSER_LABEL",
    descriptionKey: "WORK$TOOL_BROWSER_DESCRIPTION",
  },
];

const OPTIONAL_TOOL_BY_ID = new Map(
  WORK_OPTIONAL_TOOLS.map((tool) => [tool.id, tool]),
);

export interface WorkToolRequest {
  toolId: WorkOptionalToolId;
  reason: string;
}

const WORK_TOOL_REQUEST_PATTERN =
  /<WORK_TOOL_REQUEST\s+tool="([^"]+)"(?:\s+reason="([^"]*)")?\s*\/?>/gi;

function browserToolsEnabled() {
  return import.meta.env.VITE_ENABLE_BROWSER_TOOLS !== "false";
}

export function isKnownWorkOptionalToolId(
  value: string,
): value is WorkOptionalToolId {
  return OPTIONAL_TOOL_BY_ID.has(value as WorkOptionalToolId);
}

export function isWorkOptionalToolAvailable(
  toolId: WorkOptionalToolId,
): boolean {
  const definition = OPTIONAL_TOOL_BY_ID.get(toolId);
  if (!definition) {
    return false;
  }

  if (definition.id === "browser") {
    return (
      browserToolsEnabled() &&
      isAgentServerToolAvailable(definition.agentToolName)
    );
  }

  return isAgentServerToolAvailable(definition.agentToolName);
}

export function getAvailableWorkOptionalTools(): WorkOptionalToolDefinition[] {
  return WORK_OPTIONAL_TOOLS.filter((tool) =>
    isWorkOptionalToolAvailable(tool.id),
  );
}

export function serializeWorkOptionalToolIds(ids: string[]): string {
  const unique = Array.from(
    new Set(
      ids.filter(
        (id): id is WorkOptionalToolId =>
          isKnownWorkOptionalToolId(id) && isWorkOptionalToolAvailable(id),
      ),
    ),
  );
  return unique.join(",");
}

export function parseWorkOptionalToolIds(
  raw?: string | null,
): WorkOptionalToolId[] {
  if (!raw?.trim()) {
    return [];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(
      (entry): entry is WorkOptionalToolId =>
        isKnownWorkOptionalToolId(entry) && isWorkOptionalToolAvailable(entry),
    );
}

export function resolveWorkAgentToolNames(
  enabledOptionalToolIds: Iterable<string>,
): string[] {
  const names = new Set<string>(WORK_BASE_TOOL_NAMES);

  for (const toolId of enabledOptionalToolIds) {
    if (!isKnownWorkOptionalToolId(toolId)) {
      continue;
    }
    if (!isWorkOptionalToolAvailable(toolId)) {
      continue;
    }
    const definition = OPTIONAL_TOOL_BY_ID.get(toolId);
    if (definition) {
      names.add(definition.agentToolName);
    }
  }

  return Array.from(names);
}

export function parseWorkToolRequests(text: string): WorkToolRequest[] {
  const requests: WorkToolRequest[] = [];
  const pattern = new RegExp(WORK_TOOL_REQUEST_PATTERN.source, "gi");
  let match = pattern.exec(text);

  while (match) {
    const toolId = match[1];
    if (isKnownWorkOptionalToolId(toolId)) {
      requests.push({
        toolId,
        reason: match[2]?.trim() ?? "",
      });
    }
    match = pattern.exec(text);
  }

  return requests;
}

export function stripWorkToolRequests(text: string): string {
  return text.replace(WORK_TOOL_REQUEST_PATTERN, "").trim();
}

export function getWorkOptionalToolDefinition(toolId: WorkOptionalToolId) {
  return OPTIONAL_TOOL_BY_ID.get(toolId);
}
