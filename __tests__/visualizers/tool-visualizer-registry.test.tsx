import type React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEventContent } from "#/components/conversation-events/chat";
import {
  addonApi,
  clearRegisteredToolVisualizersForTest,
  registerToolVisualizer,
} from "#/visualizers";
import {
  ActionEvent,
  ObservationEvent,
  SecurityRisk,
} from "#/types/agent-server/core";

const terminalActionEvent: ActionEvent = {
  id: "action-1",
  timestamp: new Date().toISOString(),
  source: "agent",
  thought: [],
  thinking_blocks: [],
  action: {
    kind: "TerminalAction",
    command: "git status",
    is_input: false,
    timeout: null,
    reset: false,
  },
  tool_name: "terminal",
  tool_call_id: "tool-1",
  tool_call: {
    id: "tool-1",
    type: "function",
    function: {
      name: "terminal",
      arguments: '{"command":"git status"}',
    },
  },
  llm_response_id: "response-1",
  security_risk: SecurityRisk.LOW,
};

const terminalObservationEvent: ObservationEvent = {
  id: "obs-1",
  timestamp: new Date().toISOString(),
  source: "environment",
  tool_name: "terminal",
  tool_call_id: "tool-1",
  action_id: "action-1",
  observation: {
    kind: "TerminalObservation",
    content: [{ type: "text", text: "On branch main" }],
    command: "git status",
    exit_code: 0,
    is_error: false,
    timeout: false,
    metadata: {
      exit_code: 0,
      pid: 1,
      username: "openhands",
      hostname: "runtime",
      prefix: "",
      suffix: "",
      working_dir: "/workspace/project/agent-canvas",
      py_interpreter_path: null,
    },
  },
};

const taskTrackerObservationEvent: ObservationEvent = {
  id: "obs-task",
  timestamp: new Date().toISOString(),
  source: "environment",
  tool_name: "task_tracker",
  tool_call_id: "tool-task",
  action_id: "action-task",
  observation: {
    kind: "TaskTrackerObservation",
    content: "",
    command: "plan",
    task_list: [
      {
        title: "Implement addon visualizer API",
        notes: "",
        status: "in_progress",
      },
    ],
  },
};

const renderDetails = (details: string | React.ReactNode) =>
  render(<>{details}</>);

beforeEach(() => {
  clearRegisteredToolVisualizersForTest();
});

afterEach(() => {
  clearRegisteredToolVisualizersForTest();
  vi.restoreAllMocks();
});

describe("tool visualizer registry", () => {
  it("lets addon registrations override default markdown rendering", () => {
    registerToolVisualizer({
      id: "acme.terminal.status",
      observationKinds: ["TerminalObservation"],
      Body({ observation }) {
        return <div>{observation?.observation.kind}</div>;
      },
    });

    const { details } = getEventContent(
      terminalObservationEvent,
      terminalActionEvent,
    );

    renderDetails(details);

    expect(screen.getByText("TerminalObservation")).toBeInTheDocument();
    expect(screen.queryByText("On branch main")).not.toBeInTheDocument();
  });

  it("orders matching addon visualizers by latest registration first", () => {
    registerToolVisualizer({
      id: "acme.terminal.first",
      observationKinds: ["TerminalObservation"],
      Body() {
        return <div>first registered renderer</div>;
      },
    });
    registerToolVisualizer({
      id: "acme.terminal.second",
      observationKinds: ["TerminalObservation"],
      Body() {
        return <div>second registered renderer</div>;
      },
    });

    const { details } = getEventContent(
      terminalObservationEvent,
      terminalActionEvent,
    );

    renderDetails(details);

    expect(screen.getByText("second registered renderer")).toBeInTheDocument();
    expect(
      screen.queryByText("first registered renderer"),
    ).not.toBeInTheDocument();
  });

  it("uses matches to target one event variant without replacing the whole kind", () => {
    registerToolVisualizer({
      id: "acme.terminal.default",
      observationKinds: ["TerminalObservation"],
      Body() {
        return <div>default terminal renderer</div>;
      },
    });
    registerToolVisualizer({
      id: "acme.terminal.npm-test",
      observationKinds: ["TerminalObservation"],
      matches({ action }) {
        return (
          action?.action.kind === "TerminalAction" &&
          action.action.command === "npm test"
        );
      },
      Body() {
        return <div>npm test renderer</div>;
      },
    });
    const { details } = getEventContent(
      terminalObservationEvent,
      terminalActionEvent,
    );

    renderDetails(details);

    expect(screen.getByText("default terminal renderer")).toBeInTheDocument();
    expect(screen.queryByText("npm test renderer")).not.toBeInTheDocument();

    const npmTestActionEvent: ActionEvent = {
      ...terminalActionEvent,
      action: {
        kind: "TerminalAction",
        command: "npm test",
        is_input: false,
        timeout: null,
        reset: false,
      },
    };
    const { details: matchedDetails } = getEventContent(
      terminalObservationEvent,
      npmTestActionEvent,
    );

    renderDetails(matchedDetails);

    expect(screen.getByText("npm test renderer")).toBeInTheDocument();
  });

  it("keeps addon visualizers ahead of built-ins", () => {
    addonApi.registerToolVisualizer({
      id: "acme.task-tracker",
      observationKinds: ["TaskTrackerObservation"],
      Body() {
        return <div>addon task tracker renderer</div>;
      },
    });

    const { details } = getEventContent(taskTrackerObservationEvent);

    renderDetails(details);

    expect(screen.getByText("addon task tracker renderer")).toBeInTheDocument();
    expect(
      screen.queryByText("Implement addon visualizer API"),
    ).not.toBeInTheDocument();
  });

  it("falls back to the next renderer when an addon renderer throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    registerToolVisualizer({
      id: "acme.task-tracker.broken",
      observationKinds: ["TaskTrackerObservation"],
      Body() {
        throw new Error("broken visualizer");
      },
    });

    const { details } = getEventContent(taskTrackerObservationEvent);

    renderDetails(details);

    expect(
      screen.getByText("Implement addon visualizer API"),
    ).toBeInTheDocument();
  });

  it("falls back to default markdown when every matching visualizer throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    registerToolVisualizer({
      id: "acme.terminal.broken",
      observationKinds: ["TerminalObservation"],
      Body() {
        throw new Error("broken visualizer");
      },
    });

    const { details } = getEventContent(
      terminalObservationEvent,
      terminalActionEvent,
    );

    renderDetails(details);

    expect(screen.getByText(/On branch main/)).toBeInTheDocument();
  });
});
