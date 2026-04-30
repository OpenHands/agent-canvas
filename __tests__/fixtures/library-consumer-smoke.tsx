import {
  AgentServerUIProviders,
  BrowserPanel,
  ConversationView,
  SettingsPanel,
  TerminalPanel,
} from "@openhands/agent-server-gui";
import { LLMSettings } from "@openhands/agent-server-gui/settings";
import { Sidebar } from "@openhands/agent-server-gui/sidebar";

export function SmokeImportConsumer() {
  return (
    <AgentServerUIProviders>
      <ConversationView />
      <BrowserPanel />
      <TerminalPanel />
      <SettingsPanel navigationItems={[]}>
        <LLMSettings />
      </SettingsPanel>
      <Sidebar />
    </AgentServerUIProviders>
  );
}
