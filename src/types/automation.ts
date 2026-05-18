export interface AutomationTrigger {
  type: string;
  schedule?: string;
  schedule_human?: string;
}

export interface Automation {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  enabled: boolean;
  repository?: string;
  model?: string;
  created_at: string;
  updated_at: string;
  prompt: string | null;
  branch?: string;
  plugins?: string[];
  notification?: string;
  timezone?: string;
  last_triggered_at?: string | null;
}

export interface AutomationsResponse {
  automations: Automation[];
  total: number;
}

export enum AutomationRunStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export interface AutomationRun {
  id: string;
  status: AutomationRunStatus;
  conversation_id: string | null;
  /**
   * ID of the bash command that ran the automation inside the agent-server
   * sandbox. Used to fetch run logs from
   * `/api/bash/bash_events/{bash_command_id}` and the matching
   * `BashOutput` events. Null when the run failed before a command was
   * dispatched (e.g. sandbox provisioning errors).
   */
  bash_command_id: string | null;
  error_detail: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface AutomationRunsResponse {
  runs: AutomationRun[];
  total: number;
}
