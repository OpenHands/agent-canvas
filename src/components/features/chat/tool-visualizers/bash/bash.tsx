import React from "react";
import { useTranslation } from "react-i18next";
import { SecurityRisk } from "#/types/agent-server/core";
import { I18nKey } from "#/i18n/declaration";
import TerminalIcon from "#/icons/terminal.svg?react";
import OutputIcon from "#/icons/arrow-down-curve.svg?react";
import { defineVisualizer } from "../define";
import { textFromContent } from "../text-content";
import { CodeBlock } from "../primitives/code-block";
import { OutputPane } from "../primitives/output-pane";

/**
 * Bash / terminal visualizer. The action card shows the command (marked with a
 * terminal icon, plus a risk warning for HIGH/MEDIUM actions); the observation
 * card shows the command and its output (marked with an output icon and an
 * exit-code badge). Covers both the `execute_bash` and `terminal` tools, which
 * carry the same `command` / `content` / `exit_code` fields. The leading icons
 * replace the markdown path's "Command:" / "Output:" labels, so the card needs
 * no localized labels.
 */
export const bashVisualizer = defineVisualizer({
  actionKinds: ["ExecuteBashAction", "TerminalAction"],
  observationKinds: ["ExecuteBashObservation", "TerminalObservation"],
  Body: function BashBody({ action, observation }) {
    const { t } = useTranslation("openhands");
    const command =
      observation?.observation.command ?? action?.action.command ?? "";
    const risk = action?.security_risk;

    return (
      <div className="flex flex-col gap-2">
        {command && (
          <div className="flex items-start gap-1.5">
            <TerminalIcon
              aria-hidden="true"
              className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-muted"
            />
            <div className="min-w-0 flex-1">
              <CodeBlock code={command} language="bash" />
            </div>
          </div>
        )}
        {(risk === SecurityRisk.HIGH || risk === SecurityRisk.MEDIUM) && (
          <span className="text-xs text-status-fail-text">
            {t(
              risk === SecurityRisk.HIGH
                ? I18nKey.SECURITY$HIGH_RISK
                : I18nKey.SECURITY$MEDIUM_RISK,
            )}
          </span>
        )}
        {observation && (
          <div className="flex items-start gap-1.5">
            <OutputIcon
              aria-hidden="true"
              className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-muted"
            />
            <div className="min-w-0 flex-1">
              <OutputPane
                output={textFromContent(observation.observation.content)}
                exitCode={observation.observation.exit_code}
              />
            </div>
          </div>
        )}
      </div>
    );
  },
});
