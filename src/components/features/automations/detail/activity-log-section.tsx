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
  const { data, isLoading } = useAutomationRuns(automationId, limit, 0);

  const hasMore = data ? data.total > data.runs.length : false;

  return (
    <div className="rounded-2xl border border-neutral-700 bg-neutral-800">
      <div className="flex items-center gap-2 border-b border-neutral-700 px-5 pb-3 pt-4">
        <span className="size-4 text-neutral-400">
          <ActivityIcon className="size-4" />
        </span>
        <h3 className="text-sm font-medium text-neutral-200">
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
              <div className="h-5 w-64 animate-pulse rounded bg-neutral-700" />
              <div className="h-6 w-24 animate-pulse rounded-full bg-neutral-700" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && data && data.runs.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-neutral-400">
          {t(I18nKey.AUTOMATIONS$DETAIL$NO_RUNS)}
        </p>
      )}

      {!isLoading && data && data.runs.length > 0 && (
        <div>
          {data.runs.map((run, index) => (
            <div
              key={run.id}
              className={index > 0 ? "border-t border-neutral-700" : ""}
            >
              <ActivityLogItem run={run} />
            </div>
          ))}

          {hasMore && (
            <div className="border-t border-neutral-700 px-5 py-3">
              <button
                type="button"
                onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
                className="text-sm text-neutral-400 hover:text-neutral-200"
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
