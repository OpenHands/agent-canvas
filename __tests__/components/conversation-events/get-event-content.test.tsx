import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getEventContent } from "#/components/conversation-events/chat";
import { ActionEvent, ObservationEvent, SecurityRisk } from "#/types/agent-server/core";

const terminalActionEvent: ActionEvent = {
  id: "action-1",
  timestamp: new Date().toISOString(),
  source: "agent",
  thought: [{ type: "text", text: "Checking repository status." }],
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
  summary: "Check repository status",
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
      working_dir: "/workspace/project/OpenHands",
      py_interpreter_path: null,
    },
  },
};

describe("getEventContent", () => {
  it("uses the action summary as the full action title", () => {
    const { title } = getEventContent(terminalActionEvent);

    render(<span>{title}</span>);

    expect(screen.getByText("Check repository status")).toBeInTheDocument();
    expect(screen.queryByText("$ git status")).not.toBeInTheDocument();
  });

  it("falls back to command-based title when summary is missing", () => {
    const actionWithoutSummary = { ...terminalActionEvent, summary: undefined };
    const { title } = getEventContent(actionWithoutSummary);

    render(<span>{title}</span>);

    // Without i18n loaded, the translation key renders as the raw key
    expect(screen.getByText("ACTION_MESSAGE$RUN")).toBeInTheDocument();
    expect(
      screen.queryByText("Check repository status"),
    ).not.toBeInTheDocument();
  });

  it("ignores the agent-server fallback summary ('tool_name: {args}') and uses the action-kind title", () => {
    // The SDK's `_extract_summary` emits `f"{tool_name}: {json}"` when the
    // LLM omits a summary. That blob should not be shown as the title.
    const actionWithFallbackSummary = {
      ...terminalActionEvent,
      summary: 'terminal: {"command":"git status"}',
    };
    const { title } = getEventContent(actionWithFallbackSummary);

    render(<span>{title}</span>);

    expect(screen.getByText("ACTION_MESSAGE$RUN")).toBeInTheDocument();
    expect(
      screen.queryByText('terminal: {"command":"git status"}'),
    ).not.toBeInTheDocument();
  });

  it("ignores fallback summary on the paired observation as well", () => {
    const actionWithFallbackSummary = {
      ...terminalActionEvent,
      summary: 'terminal: {"command":"git status"}',
    };
    const { title } = getEventContent(
      terminalObservationEvent,
      actionWithFallbackSummary,
    );

    render(<span>{title}</span>);

    expect(screen.getByText("OBSERVATION_MESSAGE$RUN")).toBeInTheDocument();
    expect(
      screen.queryByText('terminal: {"command":"git status"}'),
    ).not.toBeInTheDocument();
  });

  it("renders a file view action through the file-editor visualizer", () => {
    const fileViewAction: ActionEvent = {
      id: "action-2",
      timestamp: new Date().toISOString(),
      source: "agent",
      thought: [],
      thinking_blocks: [],
      action: {
        kind: "FileEditorAction",
        command: "view",
        path: "/workspace/README.md",
        file_text: null,
        old_str: null,
        new_str: null,
        insert_line: null,
        view_range: null,
      },
      tool_name: "file_editor",
      tool_call_id: "tool-2",
      tool_call: {
        id: "tool-2",
        type: "function",
        function: {
          name: "file_editor",
          arguments: '{"command":"view","path":"/workspace/README.md"}',
        },
      },
      llm_response_id: "response-2",
      security_risk: SecurityRisk.LOW,
    };

    const { title, details } = getEventContent(fileViewAction);

    render(<span>{title}</span>);
    expect(screen.getByText("ACTION_MESSAGE$READ")).toBeInTheDocument();
    // FileEditor is now migrated to a React visualizer: details is a node that
    // renders the file-path chip rather than the old empty markdown string.
    expect(typeof details).not.toBe("string");
    render(<div>{details}</div>);
    expect(screen.getByText("/workspace/README.md")).toBeInTheDocument();
  });

  it("shows action kind for action-like events missing tool_name/tool_call_id", () => {
    // Simulate an event that has an action object but fails the strict isActionEvent() guard
    const malformedEvent = {
      id: "action-3",
      timestamp: new Date().toISOString(),
      source: "agent" as const,
      action: { kind: "FileEditorAction" },
    };

    const { title, details } = getEventContent(malformedEvent as any);

    expect(title).toBe("FILEEDITOR");
    expect(details).toBe("");
  });

  it("reuses the action summary as the full paired observation title", () => {
    const { title } = getEventContent(
      terminalObservationEvent,
      terminalActionEvent,
    );

    render(<span>{title}</span>);

    expect(screen.getByText("Check repository status")).toBeInTheDocument();
    expect(screen.queryByText("$ git status")).not.toBeInTheDocument();
  });

  it("renders InvokeSkillAction with the skill name instead of 'INVOKESKILL'", () => {
    const invokeSkillAction: ActionEvent = {
      id: "action-skill",
      timestamp: new Date().toISOString(),
      source: "agent",
      thought: [],
      thinking_blocks: [],
      action: {
        kind: "InvokeSkillAction",
        name: "worktree-switch",
      },
      tool_name: "invoke_skill",
      tool_call_id: "tool-skill",
      tool_call: {
        id: "tool-skill",
        type: "function",
        function: {
          name: "invoke_skill",
          arguments: '{"name":"worktree-switch"}',
        },
      },
      llm_response_id: "response-skill",
      security_risk: SecurityRisk.LOW,
    };

    const { title, details } = getEventContent(invokeSkillAction);

    render(<span>{title}</span>);
    // Without i18n loaded, the translation key renders as the raw key —
    // the important thing is that we no longer fall back to "INVOKESKILL".
    expect(screen.getByText("ACTION_MESSAGE$INVOKE_SKILL")).toBeInTheDocument();
    expect(screen.queryByText("INVOKESKILL")).not.toBeInTheDocument();
    expect(details).toContain("worktree-switch");
  });

  it("renders InvokeSkillObservation with the skill name", () => {
    const invokeSkillObservation: ObservationEvent = {
      id: "obs-skill",
      timestamp: new Date().toISOString(),
      source: "environment",
      tool_name: "invoke_skill",
      tool_call_id: "tool-skill",
      action_id: "action-skill",
      observation: {
        kind: "InvokeSkillObservation",
        skill_name: "worktree-switch",
        content: [{ type: "text", text: "# Skill content" }],
      },
    };

    const { title, details } = getEventContent(invokeSkillObservation);

    render(<span>{title}</span>);
    expect(
      screen.getByText("OBSERVATION_MESSAGE$INVOKE_SKILL"),
    ).toBeInTheDocument();
    expect(screen.queryByText("INVOKESKILL")).not.toBeInTheDocument();
    expect(details).toContain("worktree-switch");
    expect(details).toContain("# Skill content");
  });
});
