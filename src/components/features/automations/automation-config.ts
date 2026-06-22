import { I18nKey } from "#/i18n/declaration";

/**
 * Per-automation structured configuration.
 *
 * Issue #950: clicking a pre-built automation used to drop the catalog's
 * open-ended natural-language prompt straight into a conversation, leaving the
 * agent to freely interpret the polling frequency and whether to spawn a fresh
 * conversation on every interval (burning tokens). Instead, automations that
 * declare a config schema here collect a few structured values from the user
 * and then launch with a *deterministic* prompt that pins the schedule and the
 * "only create a conversation when a new match is found" contract.
 *
 * Field labels/options are referenced by `I18nKey` so the form stays
 * translatable; the generated prompt is agent-facing data (English), mirroring
 * the `<RUNTIME_SERVICES>` suffix in `agent-server-adapter.ts`.
 */

export type AutomationConfigFieldType = "text" | "select";

export interface AutomationConfigSelectOption {
  /** Stable value substituted into the prompt. */
  value: string;
  labelKey: I18nKey;
}

export interface AutomationConfigField {
  /** Stable key used as the value map key and `{{placeholder}}` token. */
  key: string;
  type: AutomationConfigFieldType;
  labelKey: I18nKey;
  placeholderKey?: I18nKey;
  helperTextKey?: I18nKey;
  required: boolean;
  /** Default value (and default-selected option for `select`). */
  defaultValue?: string;
  /** Options for `select` fields. */
  options?: AutomationConfigSelectOption[];
}

export interface AutomationConfig {
  /** Matches `RecommendedAutomation.id`. */
  automationId: string;
  titleKey: I18nKey;
  descriptionKey: I18nKey;
  fields: AutomationConfigField[];
  /**
   * Builds the deterministic launch prompt from validated field values. This
   * is the load-bearing reliability fix: every instruction the catalog prompt
   * previously left to the model (schedule cadence, scheduled-vs-event, when to
   * open a conversation) is spelled out here so repeated runs are predictable.
   */
  buildPrompt: (values: Record<string, string>) => string;
}

// Fixed polling cadence for scheduled pre-built automations. Pinned (rather
// than model-chosen) so runs are predictable and don't burn tokens — see
// issue #950, problem 2A.
const DEFAULT_POLL_CRON = "*/5 * * * *";
const DEFAULT_POLL_HUMAN = "every 5 minutes";

const GITHUB_PR_REVIEWER_CONFIG: AutomationConfig = {
  automationId: "github-pr-reviewer",
  titleKey: I18nKey.AUTOMATION_CONFIG$PR_REVIEWER_TITLE,
  descriptionKey: I18nKey.AUTOMATION_CONFIG$PR_REVIEWER_DESCRIPTION,
  fields: [
    {
      key: "repository",
      type: "text",
      labelKey: I18nKey.AUTOMATION_CONFIG$REPOSITORY_LABEL,
      placeholderKey: I18nKey.AUTOMATION_CONFIG$REPOSITORY_PLACEHOLDER,
      helperTextKey: I18nKey.AUTOMATION_CONFIG$REPOSITORY_HELPER,
      required: true,
    },
    {
      key: "reviewStyle",
      type: "select",
      labelKey: I18nKey.AUTOMATION_CONFIG$REVIEW_STYLE_LABEL,
      helperTextKey: I18nKey.AUTOMATION_CONFIG$REVIEW_STYLE_HELPER,
      required: true,
      defaultValue: "balanced",
      options: [
        {
          value: "balanced",
          labelKey: I18nKey.AUTOMATION_CONFIG$REVIEW_STYLE_BALANCED,
        },
        {
          value: "roasted",
          labelKey: I18nKey.AUTOMATION_CONFIG$REVIEW_STYLE_ROASTED,
        },
      ],
    },
    {
      key: "respondToLabel",
      type: "text",
      labelKey: I18nKey.AUTOMATION_CONFIG$RESPOND_TO_LABEL_LABEL,
      placeholderKey: I18nKey.AUTOMATION_CONFIG$RESPOND_TO_LABEL_PLACEHOLDER,
      helperTextKey: I18nKey.AUTOMATION_CONFIG$RESPOND_TO_LABEL_HELPER,
      required: false,
    },
  ],
  buildPrompt: (values) => {
    const repository = values.repository?.trim() ?? "";
    const reviewStyle = values.reviewStyle?.trim() || "balanced";
    const respondToLabel = values.respondToLabel?.trim() ?? "";

    const styleInstruction =
      reviewStyle === "roasted"
        ? "Use a direct, candid, no-sugar-coating review tone (a friendly roast): be blunt about problems while staying professional and actionable."
        : "Use a balanced, constructive review tone: acknowledge what is good and clearly flag risks with concrete suggestions.";

    const labelClause = respondToLabel
      ? `Only review pull requests that carry the "${respondToLabel}" label. Skip every pull request without that label.`
      : "Review every newly opened or updated pull request in the repository.";

    // Each numbered instruction removes a degree of freedom that the old
    // open-ended catalog prompt left to the model.
    return [
      `Create a SCHEDULED OpenHands automation (NOT an event-driven one) that reviews GitHub pull requests in the repository "${repository}".`,
      "",
      "Configure it EXACTLY as follows — do not improvise on any of these points:",
      `1. Trigger: a scheduled (cron) trigger that runs on the cron expression "${DEFAULT_POLL_CRON}" (${DEFAULT_POLL_HUMAN}). Do NOT pick a different interval and do NOT create an event/webhook trigger.`,
      `2. On each scheduled run, use the GitHub MCP to poll "${repository}" for pull requests that are new or updated since the previous run. Track the last-seen state (e.g. the latest reviewed commit SHA per PR) so the same commit is never reviewed twice.`,
      "3. CRITICAL — token usage: do NOT start a new agent conversation on every interval. Only create a conversation when the poll finds at least one pull request that matches the criteria AND has not already been reviewed. If nothing new matches, the run must end without creating a conversation.",
      `4. Matching criteria: ${labelClause}`,
      "5. When a matching PR is found, inspect its diff, changed files, tests, and existing discussion, then post a concise review covering correctness risks, security issues, missing tests, and concrete next steps. Link back to the exact files and lines.",
      `6. Review tone: ${styleInstruction}`,
      "",
      "After you have created the automation with these settings, confirm back to me the schedule, the repository, and the matching criteria you configured.",
    ].join("\n");
  },
};

const AUTOMATION_CONFIGS: Record<string, AutomationConfig> = {
  [GITHUB_PR_REVIEWER_CONFIG.automationId]: GITHUB_PR_REVIEWER_CONFIG,
};

/** Returns the structured config for an automation id, if one is defined. */
export function getAutomationConfig(
  automationId: string,
): AutomationConfig | undefined {
  return AUTOMATION_CONFIGS[automationId];
}

/** Seeds a value map with each field's default (empty string when unset). */
export function getInitialConfigValues(
  config: AutomationConfig,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of config.fields) {
    values[field.key] = field.defaultValue ?? "";
  }
  return values;
}
