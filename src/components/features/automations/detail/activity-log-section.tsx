import { useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useAutomationRuns } from "#/hooks/query/use-automation-detail";
import ActivityIcon from "#/icons/activity.svg?react";
import { ActivityLogItem } from "./activity-log-item";

interface ActivityLogSectionProps {
  automationId: string;
}

const PAGE_SIZE = 20;

export function ActivityLogSection({ automationId }: ActivityLogSectionProps) {
  const { t } = useTranslation("openhands");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data, isLoading } = useAutomationRuns({
    id: automationId,
    limit,
    offset: 0,
  });

  const hasMore = data ? data.total > data.runs.length : false;

  return (
    <div className="rounded-2xl border border-border bg-surface-card">
      <div className="flex items-center gap-2 border-b border-border px-5 pb-3 pt-4">
        <span className="size-4 text-content-muted">
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
              <div className="h-5 w-64 animate-pulse rounded bg-surface-elevated" />
              <div className="h-6 w-24 animate-pulse rounded-full bg-surface-elevated" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && data?.runs.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-content-muted">
          {t(I18nKey.AUTOMATIONS$DETAIL$NO_RUNS)}
        </p>
      )}

      {!isLoading && data && data.runs.length > 0 && (
        <div>
          {data.runs.map((run, index) => (
            <div
              key={run.id}
              className={index > 0 ? "border-t border-border" : ""}
            >
              <ActivityLogItem run={run} />
            </div>
          ))}

          {hasMore && (
            <div className="border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
                className="text-sm text-content-muted hover:text-content"
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
