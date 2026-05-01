import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AgentState } from "#/types/agent-state";
import {
  ActionSecurityRisk,
  ConversationProvider,
  useAgentStore,
  useBrowserStore,
  useCommandStore,
  useConversationStore,
  useEventMessageStore,
  useMetricsStore,
  useSecurityAnalyzerStore,
  useStatusStore,
} from "#/context/conversation-context";

function readState(name: string) {
  return JSON.parse(screen.getByTestId(`${name}-state`).textContent ?? "{}");
}

function ScopedProbe({ name }: { name: string }) {
  const conversation = useConversationStore();
  const status = useStatusStore();
  const eventMessage = useEventMessageStore();
  const agent = useAgentStore();
  const browser = useBrowserStore();
  const command = useCommandStore();
  const metrics = useMetricsStore();
  const securityAnalyzer = useSecurityAnalyzerStore();

  return (
    <section>
      <pre data-testid={`${name}-state`}>
        {JSON.stringify({
          selectedTab: conversation.selectedTab,
          statusMessage: status.curStatusMessage.message,
          submittedEventIds: eventMessage.submittedEventIds,
          agentState: agent.curAgentState,
          browserUrl: browser.url,
          commands: command.commands,
          metricsCost: metrics.cost,
          securityLogs: securityAnalyzer.logs.map((log) => log.content),
        })}
      </pre>
      <button
        type="button"
        onClick={() => {
          conversation.setSelectedTab("terminal");
          status.setCurStatusMessage({
            status_update: true,
            type: "info",
            id: `${name}-status`,
            message: `${name} status`,
          });
          eventMessage.addSubmittedEventId(42);
          agent.setCurrentAgentState(AgentState.RUNNING);
          browser.setUrl(`https://${name}.example.com`);
          command.appendInput(`${name} command`);
          metrics.setMetrics({
            cost: 1,
            max_budget_per_task: null,
            usage: null,
          });
          securityAnalyzer.appendSecurityAnalyzerInput({
            id: 1,
            args: {
              command: `${name} risky command`,
              security_risk: ActionSecurityRisk.HIGH,
            },
          });
        }}
      >
        Mutate {name}
      </button>
    </section>
  );
}

describe("ConversationProvider", () => {
  it("scopes conversation stores per provider instance", async () => {
    const user = userEvent.setup();

    render(
      <>
        <ConversationProvider conversationId="alpha">
          <ScopedProbe name="alpha" />
        </ConversationProvider>
        <ConversationProvider conversationId="beta">
          <ScopedProbe name="beta" />
        </ConversationProvider>
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Mutate alpha" }));

    expect(readState("alpha")).toMatchObject({
      selectedTab: "terminal",
      statusMessage: "alpha status",
      submittedEventIds: [42],
      agentState: AgentState.RUNNING,
      browserUrl: "https://alpha.example.com",
      commands: [{ content: "alpha command", type: "input" }],
      metricsCost: 1,
      securityLogs: ["alpha risky command"],
    });

    expect(readState("beta")).toMatchObject({
      selectedTab: "editor",
      statusMessage: "",
      submittedEventIds: [],
      agentState: AgentState.LOADING,
      browserUrl: "https://github.com/OpenHands/OpenHands",
      commands: [],
      metricsCost: null,
      securityLogs: [],
    });
  });
});
