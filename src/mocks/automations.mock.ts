import type { AutomationsResponse } from "#/types/automation";

/**
 * Mock automations data matching the AutomationResponse schema from the backend.
 *
 * Backend schema fields: id, user_id, org_id, name, trigger (JSONB),
 * tarball_path, setup_script_path, entrypoint, timeout, enabled,
 * last_triggered_at, created_at, updated_at.
 *
 * The frontend Automation type only uses a subset of these fields.
 * Additional backend fields are included here for API fidelity.
 */

const now = new Date().toISOString();
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();

export const MOCK_AUTOMATIONS_RESPONSE: AutomationsResponse = {
  automations: [
    {
      id: "a1000000-0000-0000-0000-000000000001",
      name: "PR Triage Digest",
      trigger: {
        type: "cron",
        schedule: "0 9 * * 1-5",
        schedule_human: "Weekdays at 09:00",
      },
      enabled: true,
      repository: "acme/frontend-app",
      llm_profile: "triage-fast",
      created_at: daysAgo(90),
      updated_at: now,
      prompt:
        "Review newly opened pull requests in acme/frontend-app, identify risky changes, summarize likely impact, and prepare a concise digest with priority ordering for the engineering review channel.",
      branch: "main",
      plugins: ["GitHub", "Slack", "Linear"],
      notification: "Slack digest to #eng-reviews",
      timezone: "America/Los_Angeles",
      last_triggered_at: daysAgo(0),
    },
    {
      id: "a1000000-0000-0000-0000-000000000002",
      name: "Nightly Security Pass",
      trigger: {
        type: "cron",
        schedule: "30 1 * * *",
        schedule_human: "Daily at 01:30",
      },
      enabled: true,
      repository: "acme/backend-api",
      llm_profile: "security-careful",
      created_at: daysAgo(60),
      updated_at: now,
      prompt:
        "Scan the acme/backend-api repository for known security vulnerabilities, outdated dependencies, and insecure code patterns. Produce a prioritized remediation summary.",
      branch: "main",
      plugins: ["GitHub"],
      notification: "Email to security-team@acme.com",
      timezone: "UTC",
      last_triggered_at: daysAgo(0),
    },
    {
      id: "a1000000-0000-0000-0000-000000000003",
      name: "Docs Sync on Push",
      trigger: {
        type: "cron",
        schedule: "*/5 * * * *",
        schedule_human: "Runs on every push",
      },
      enabled: true,
      repository: "acme/docs",
      llm_profile: "docs-fast",
      created_at: daysAgo(45),
      updated_at: now,
      prompt:
        "Monitor acme/docs for new pushes. For each push, generate a changelog-ready summary of what changed and why.",
      branch: "main",
      plugins: ["GitHub", "Slack"],
      notification: "Slack to #docs-updates",
      timezone: "America/New_York",
      last_triggered_at: daysAgo(1),
    },
    {
      id: "a1000000-0000-0000-0000-000000000004",
      name: "Release Readiness Review",
      trigger: {
        type: "cron",
        schedule: "0 11 * * 5",
        schedule_human: "Fridays at 11:00",
      },
      enabled: false,
      repository: "acme/realtime-service",
      llm_profile: "release-review",
      created_at: daysAgo(80),
      updated_at: now,
      prompt:
        "Compile a release readiness report: list open blockers, active incidents, and pending approvals for acme/realtime-service.",
      branch: "release",
      plugins: ["GitHub", "Linear"],
      notification: "Slack to #releases",
      timezone: "America/Chicago",
      last_triggered_at: daysAgo(14),
    },
    {
      id: "a1000000-0000-0000-0000-000000000005",
      name: "Incident Webhook Summary",
      trigger: {
        type: "cron",
        schedule: "0 */2 * * *",
        schedule_human: "On incident webhook",
      },
      enabled: false,
      repository: "acme/incident-service",
      llm_profile: "incident-summary",
      created_at: daysAgo(30),
      updated_at: now,
      prompt:
        "Summarize incoming incident webhooks, categorize by severity, and post a digest to the on-call Slack channel.",
      branch: "main",
      plugins: ["Slack"],
      notification: "Slack to #oncall",
      timezone: "UTC",
      last_triggered_at: null,
    },
  ],
  total: 5,
};
