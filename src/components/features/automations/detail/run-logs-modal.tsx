import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import XMarkIcon from "#/icons/x-mark.svg?react";
import { useBashCommandLogs } from "#/hooks/query/use-bash-command-logs";
import type { BashCommandLogs } from "#/api/bash-service/bash-service.api";

interface RunLogsModalProps {
  /** Conversation that owns the bash command. */
  conversationId: string | null;
  /** Bash command id to fetch logs for. */
  bashCommandId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

interface InterleavedLine {
  /** "stdout" | "stderr" | "meta" — controls colour. */
  stream: "stdout" | "stderr" | "meta";
  text: string;
}

function joinOutputs(logs: BashCommandLogs): InterleavedLine[] {
  const lines: InterleavedLine[] = [
    { stream: "meta", text: `$ ${logs.command.command}` },
  ];
  if (logs.command.cwd) {
    lines.push({ stream: "meta", text: `cwd: ${logs.command.cwd}` });
  }

  // Outputs are paged with sort_order=TIMESTAMP, but split across pages
  // we re-sort by (timestamp, order) to keep stdout/stderr interleaved
  // in the order the runtime emitted them.
  const sorted = [...logs.outputs].sort((a, b) => {
    const ts = a.timestamp.localeCompare(b.timestamp);
    if (ts !== 0) return ts;
    return (a.order ?? 0) - (b.order ?? 0);
  });

  let sawAnyOutput = false;
  let finalExitCode: number | null | undefined;
  sorted.forEach((output) => {
    if (output.stdout) {
      sawAnyOutput = true;
      lines.push({ stream: "stdout", text: output.stdout });
    }
    if (output.stderr) {
      sawAnyOutput = true;
      lines.push({ stream: "stderr", text: output.stderr });
    }
    if (output.exit_code !== undefined && output.exit_code !== null) {
      finalExitCode = output.exit_code;
    }
  });

  if (!sawAnyOutput) {
    lines.push({ stream: "meta", text: "(no output)" });
  }
  if (finalExitCode !== undefined && finalExitCode !== null) {
    lines.push({ stream: "meta", text: `exit code: ${finalExitCode}` });
  }
  return lines;
}

function streamClassName(stream: InterleavedLine["stream"]): string {
  if (stream === "stderr") return "text-danger";
  if (stream === "meta") return "text-muted italic";
  return "text-content";
}

export function RunLogsModal({
  conversationId,
  bashCommandId,
  isOpen,
  onClose,
}: RunLogsModalProps) {
  const { t } = useTranslation("openhands");

  const {
    data,
    isFetching,
    isResolvingConversation,
    hasNoRuntime,
    conversationMissing,
    error,
  } = useBashCommandLogs({
    conversationId,
    bashCommandId,
    enabled: isOpen,
  });

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const lines = useMemo(() => (data ? joinOutputs(data) : []), [data]);

  if (!isOpen) return null;

  const loading = isResolvingConversation || isFetching;
  const noBashCommand = !bashCommandId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t(I18nKey.AUTOMATIONS$DETAIL$LOGS_TITLE)}
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="presentation"
      />
      <div className="relative flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-muted hover:text-foreground"
          aria-label={t(I18nKey.AUTOMATIONS$CANCEL)}
        >
          <XMarkIcon className="size-5" />
        </button>

        <h2 className="pr-8 text-lg font-semibold text-white">
          {t(I18nKey.AUTOMATIONS$DETAIL$LOGS_TITLE)}
        </h2>

        <div className="mt-4 min-h-[8rem] flex-1 overflow-auto rounded-lg border border-[var(--oh-border)] bg-black/40 p-4 font-mono text-xs">
          {noBashCommand && (
            <p className="text-muted italic">
              {t(I18nKey.AUTOMATIONS$DETAIL$LOGS_NO_COMMAND)}
            </p>
          )}

          {!noBashCommand && conversationMissing && (
            <p className="text-muted italic">
              {t(I18nKey.AUTOMATIONS$DETAIL$LOGS_CONVERSATION_MISSING)}
            </p>
          )}

          {!noBashCommand && !conversationMissing && hasNoRuntime && (
            <p className="text-muted italic">
              {t(I18nKey.AUTOMATIONS$DETAIL$LOGS_SANDBOX_GONE)}
            </p>
          )}

          {!noBashCommand &&
            !conversationMissing &&
            !hasNoRuntime &&
            loading &&
            !data && (
              <p className="text-muted italic">
                {t(I18nKey.AUTOMATIONS$DETAIL$LOGS_LOADING)}
              </p>
            )}

          {!loading && error && !data && (
            <p className="text-danger">
              {t(I18nKey.AUTOMATIONS$DETAIL$LOGS_ERROR)}: {String(error)}
            </p>
          )}

          {data && (
            <pre className="whitespace-pre-wrap break-words">
              {lines.map((line, idx) => (
                <span
                  key={`${line.stream}-${idx}`}
                  className={`block ${streamClassName(line.stream)}`}
                >
                  {line.text}
                </span>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
