import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import {
  Wrench,
  Play,
  Clock,
  Globe,
  ArrowRight,
  Plus,
  Compass,
  AlertCircle,
} from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useAutomations } from "#/hooks/query/use-automations";
import { useAutomationHealth } from "#/hooks/query/use-automation-health";
import { BackendNotConfigured } from "#/components/features/automations/backend-not-configured";
import { formatTimeDelta } from "#/utils/format-time-delta";

export default function AutomationsDashboard() {
  const { t } = useTranslation("openhands");
  const navigate = useNavigate();

  const {
    data: healthData,
    isLoading: isHealthLoading,
    refetch: refetchHealth,
  } = useAutomationHealth();

  const isBackendHealthy = healthData?.status === "ok";

  const { data, isLoading } = useAutomations({
    limit: 100,
    offset: 0,
    enabled: isBackendHealthy,
  });

  const stats = useMemo(() => {
    if (!data?.automations) {
      return { total: 0, active: 0, routines: 0, responders: 0 };
    }
    const total = data.automations.length;
    const active = data.automations.filter((a) => a.enabled).length;
    const routines = data.automations.filter(
      (a) => a.enabled && a.trigger.type !== "event",
    ).length;
    const responders = data.automations.filter(
      (a) => a.enabled && a.trigger.type === "event",
    ).length;

    return { total, active, routines, responders };
  }, [data?.automations]);

  const recentActivity = useMemo(() => {
    if (!data?.automations) return [];
    return data.automations
      .filter((a) => a.last_triggered_at)
      .sort((a, b) => {
        const timeA = new Date(a.last_triggered_at!).getTime();
        const timeB = new Date(b.last_triggered_at!).getTime();
        return timeB - timeA;
      })
      .slice(0, 5);
  }, [data?.automations]);

  if (isHealthLoading) {
    return (
      <div className="min-h-full p-6 max-w-4xl mx-auto">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-content">
            {t(I18nKey.AUTOMATIONS$DASHBOARD_TITLE)}
          </h1>
          <p className="text-sm text-muted">
            {t(I18nKey.AUTOMATIONS$DASHBOARD_SUBTITLE)}
          </p>
        </div>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-surface-raised animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!isBackendHealthy) {
    return (
      <div className="min-h-full p-6 max-w-4xl mx-auto">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-content">
            {t(I18nKey.AUTOMATIONS$DASHBOARD_TITLE)}
          </h1>
          <p className="text-sm text-muted">
            {t(I18nKey.AUTOMATIONS$DASHBOARD_SUBTITLE)}
          </p>
        </div>
        <BackendNotConfigured onRetry={refetchHealth} />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-content">
            {t(I18nKey.AUTOMATIONS$DASHBOARD_TITLE)}
          </h1>
          <p className="text-sm text-muted">
            {t(I18nKey.AUTOMATIONS$DASHBOARD_SUBTITLE)}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total */}
          <div className="p-4 rounded-xl bg-surface-raised border border-[var(--oh-border)] flex items-center gap-4">
            <div className="p-3 rounded-lg bg-white/5 text-[var(--oh-color-primary)]">
              <Wrench className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted font-medium">
                {t(I18nKey.AUTOMATIONS$DASHBOARD_STATS_TOTAL)}
              </p>
              <p className="text-2xl font-semibold text-white mt-0.5">
                {isLoading ? "..." : stats.total}
              </p>
            </div>
          </div>

          {/* Card 2: Active */}
          <div className="p-4 rounded-xl bg-surface-raised border border-[var(--oh-border)] flex items-center gap-4">
            <div className="p-3 rounded-lg bg-green-500/10 text-green-400">
              <Play className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted font-medium">
                {t(I18nKey.AUTOMATIONS$DASHBOARD_STATS_ACTIVE)}
              </p>
              <p className="text-2xl font-semibold text-white mt-0.5">
                {isLoading ? "..." : stats.active}
              </p>
            </div>
          </div>

          {/* Card 3: Routines */}
          <div className="p-4 rounded-xl bg-surface-raised border border-[var(--oh-border)] flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted font-medium">
                {t(I18nKey.AUTOMATIONS$DASHBOARD_STATS_ROUTINES)}
              </p>
              <p className="text-2xl font-semibold text-white mt-0.5">
                {isLoading ? "..." : stats.routines}
              </p>
            </div>
          </div>

          {/* Card 4: Responders */}
          <div className="p-4 rounded-xl bg-surface-raised border border-[var(--oh-border)] flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
              <Globe className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted font-medium">
                {t(I18nKey.AUTOMATIONS$DASHBOARD_STATS_RESPONDERS)}
              </p>
              <p className="text-2xl font-semibold text-white mt-0.5">
                {isLoading ? "..." : stats.responders}
              </p>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <div className="lg:col-span-2 p-5 rounded-xl bg-surface-raised border border-[var(--oh-border)] space-y-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Play className="size-4 text-muted" />
              {t(I18nKey.AUTOMATIONS$DASHBOARD_RECENT_ACTIVITY)}
            </h2>

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-lg bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <AlertCircle className="size-8 mx-auto text-muted" />
                <p className="text-sm text-muted max-w-sm mx-auto leading-relaxed">
                  {t(I18nKey.AUTOMATIONS$DASHBOARD_NO_ACTIVITY)}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--oh-border)]">
                {recentActivity.map((automation) => (
                  <div
                    key={automation.id}
                    onClick={() => navigate(`/automations/${automation.id}`)}
                    className="py-3 flex items-center justify-between hover:bg-white/5 px-2 rounded-lg transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {automation.trigger.type === "event" ? (
                        <Globe className="size-4 text-purple-400 shrink-0" />
                      ) : (
                        <Clock className="size-4 text-blue-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {automation.name}
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          {t(I18nKey.AUTOMATIONS$DASHBOARD_RECENT_RUN_AGO, {
                            time: formatTimeDelta(
                              automation.last_triggered_at!,
                            ),
                          })}
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="size-4 text-muted shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="space-y-4">
            {/* Template CTA */}
            <Link
              to="/automations/templates"
              className="block p-5 rounded-xl bg-surface-raised border border-[var(--oh-border)] hover:border-[var(--oh-color-primary)] transition-all group space-y-3"
            >
              <div className="p-2.5 rounded-lg bg-white/5 text-[var(--oh-color-primary)] w-fit">
                <Compass className="size-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white group-hover:text-[var(--oh-color-primary)] flex items-center gap-1.5 transition-colors">
                  {t(I18nKey.AUTOMATIONS$DASHBOARD_CTA_TEMPLATES_TITLE)}
                  <ArrowRight className="size-3.5 group-hover:translate-x-1 transition-transform" />
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  {t(I18nKey.AUTOMATIONS$DASHBOARD_CTA_TEMPLATES_DESC)}
                </p>
              </div>
            </Link>

            {/* Custom CTA */}
            <Link
              to="/automations/workflows"
              className="block p-5 rounded-xl bg-surface-raised border border-[var(--oh-border)] hover:border-[var(--oh-color-primary)] transition-all group space-y-3"
            >
              <div className="p-2.5 rounded-lg bg-white/5 text-green-400 w-fit">
                <Plus className="size-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white group-hover:text-[var(--oh-color-primary)] flex items-center gap-1.5 transition-colors">
                  {t(I18nKey.AUTOMATIONS$DASHBOARD_CTA_CREATE_TITLE)}
                  <ArrowRight className="size-3.5 group-hover:translate-x-1 transition-transform" />
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  {t(I18nKey.AUTOMATIONS$DASHBOARD_CTA_CREATE_DESC)}
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
