import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useAutomationRuns } from "#/hooks/query/use-automation-detail";
import ActivityIcon from "#/icons/activity.svg?react";
import SearchIcon from "#/icons/search.svg?react";
import { AutomationRunStatus, type AutomationRun } from "#/types/automation";
import { cn } from "#/utils/utils";
import { AUTOMATION_RUN_STATUS_LABEL_KEYS } from "./run-status-badge";
import { ActivityLogItem } from "./activity-log-item";

interface ActivityLogSectionProps {
  automationId: string;
}

const PAGE_SIZE = 20;

const STATUS_TYPE_ORDER: AutomationRunStatus[] = [
  AutomationRunStatus.PENDING,
  AutomationRunStatus.RUNNING,
  AutomationRunStatus.COMPLETED,
  AutomationRunStatus.FAILED,
];

type StateTypeFilterChoice = "all" | AutomationRunStatus;

function runMatchesStateNameQuery(
  run: AutomationRun,
  q: string,
  translate: (key: I18nKey) => string,
): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const labeled = translate(
    AUTOMATION_RUN_STATUS_LABEL_KEYS[run.status],
  ).toLowerCase();
  const parts = [
    run.status.toLowerCase(),
    labeled,
    run.id.toLowerCase(),
    (run.conversation_id ?? "").toLowerCase(),
    (run.error_detail ?? "").toLowerCase(),
  ];
  return parts.some((p) => p.includes(needle));
}

export function ActivityLogSection({ automationId }: ActivityLogSectionProps) {
  const { t } = useTranslation("openhands");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [stateTypeFilter, setStateTypeFilter] =
    useState<StateTypeFilterChoice>("all");
  const [stateNameQuery, setStateNameQuery] = useState("");

  const { data, isLoading } = useAutomationRuns({
    id: automationId,
    limit,
    offset: 0,
  });

  const filteredRuns = useMemo(() => {
    if (!data?.runs.length) return [];
    return data.runs.filter((run) => {
      if (stateTypeFilter !== "all" && run.status !== stateTypeFilter) {
        return false;
      }
      return runMatchesStateNameQuery(run, stateNameQuery.trim(), t);
    });
  }, [data?.runs, stateTypeFilter, stateNameQuery, t]);

  const hasMore = data ? data.total > data.runs.length : false;
  const hasRuns = !isLoading && (data?.runs.length ?? 0) > 0;
  const filtersHideEveryRun =
    hasRuns && data && data.runs.length > 0 && filteredRuns.length === 0;

  return (
    <div className="rounded-2xl border border-[var(--oh-border)] bg-[var(--oh-surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--oh-border)] px-5 py-3">
        <span className="size-4 text-muted">
          <ActivityIcon className="size-4" />
        </span>
        <h3 className="text-sm font-medium text-content">
          {t(I18nKey.AUTOMATIONS$DETAIL$ACTIVITY_LOG)}
        </h3>
      </div>

      {isLoading && (
        <div className="space-y-1 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="flex items-center justify-between py-3"
            >
              <div className="h-5 w-64 animate-pulse rounded bg-surface-raised" />
              <div className="h-6 w-24 animate-pulse rounded-full bg-surface-raised" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && data?.runs.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-muted">
          {t(I18nKey.AUTOMATIONS$DETAIL$NO_RUNS)}
        </p>
      )}

      {hasRuns && (
        <div className="flex flex-col gap-3 border-b border-[var(--oh-border)] px-5 py-3 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs text-muted">
              {t(I18nKey.AUTOMATIONS$DETAIL$RUNS_FILTER_STATE_TYPE)}
            </span>
            <select
              id="activity-runs-state-type-filter"
              value={stateTypeFilter}
              onChange={(e) => {
                const v = e.target.value;
                setStateTypeFilter(
                  v === "all" ? "all" : (v as AutomationRunStatus),
                );
              }}
              className="h-9 rounded-lg border border-[var(--oh-border)] bg-base-secondary px-3 text-sm text-white outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20"
            >
              <option value="all">
                {t(I18nKey.AUTOMATIONS$DETAIL$RUNS_FILTER_ALL_STATE_TYPES)}
              </option>
              {STATUS_TYPE_ORDER.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-[2] flex-col gap-1">
            <span className="sr-only">
              {t(I18nKey.AUTOMATIONS$DETAIL$RUNS_FILTER_STATE_NAME)}
            </span>
            <div
              className={cn(
                "relative flex min-w-0 items-center",
                "h-9 rounded-lg border border-[var(--oh-border)] bg-base-secondary",
                "focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/20",
              )}
            >
              <SearchIcon
                className="ml-3 size-4 shrink-0 text-tertiary-alt"
                aria-hidden
              />
              <input
                type="text"
                value={stateNameQuery}
                onChange={(e) => setStateNameQuery(e.target.value)}
                placeholder={t(
                  I18nKey.AUTOMATIONS$DETAIL$RUNS_FILTER_STATE_NAME,
                )}
                aria-label={t(
                  I18nKey.AUTOMATIONS$DETAIL$RUNS_FILTER_STATE_NAME,
                )}
                className="min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-white outline-none placeholder:text-tertiary-alt"
              />
            </div>
          </label>
        </div>
      )}

      {filtersHideEveryRun && (
        <p className="px-5 py-8 text-center text-sm text-muted">
          {t(I18nKey.AUTOMATIONS$DETAIL$RUNS_FILTER_NO_MATCHES)}
        </p>
      )}

      {hasRuns && filteredRuns.length > 0 && (
        <div>
          {filteredRuns.map((run, index) => (
            <div
              key={run.id}
              className={index > 0 ? "border-t border-[var(--oh-border)]" : ""}
            >
              <ActivityLogItem run={run} />
            </div>
          ))}

          {hasMore && (
            <div className="border-t border-[var(--oh-border)] px-5 py-3">
              <button
                type="button"
                onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
                className="text-sm text-muted hover:text-foreground"
              >
                {t(I18nKey.AUTOMATIONS$DETAIL$LOAD_MORE_RUNS)}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
