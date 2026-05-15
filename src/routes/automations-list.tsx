import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  useAutomations,
  useToggleAutomation,
  useDeleteAutomation,
} from "#/hooks/query/use-automations";
import { useAutomationHealth } from "#/hooks/query/use-automation-health";
import { SearchInput } from "#/components/features/automations/search-input";
import { AutomationGroup } from "#/components/features/automations/automation-group";
import { AutomationCardSkeleton } from "#/components/features/automations/automation-card-skeleton";
import { EmptyState } from "#/components/features/automations/empty-state";
import { ErrorState } from "#/components/features/automations/error-state";
import { BackendNotConfigured } from "#/components/features/automations/backend-not-configured";
import { DeleteConfirmationModal } from "#/components/features/automations/delete-confirmation-modal";
import { CreateInstructions } from "#/components/features/automations/create-instructions";

const PAGE_SIZE = 50;

export default function AutomationsList() {
  const { t } = useTranslation("openhands");
  const [searchQuery, setSearchQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const {
    data: healthData,
    isLoading: isHealthLoading,
    refetch: refetchHealth,
  } = useAutomationHealth();

  const isBackendHealthy = healthData?.status === "ok";

  // Only fetch automations if the backend is healthy
  const { data, isLoading, isError, refetch } = useAutomations({
    limit,
    offset: 0,
    enabled: isBackendHealthy,
  });
  const toggleMutation = useToggleAutomation();
  const deleteMutation = useDeleteAutomation();

  const filtered = useMemo(() => {
    if (!data?.automations) return [];
    const q = searchQuery.toLowerCase();
    if (!q) return data.automations;
    return data.automations.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.prompt ?? "").toLowerCase().includes(q) ||
        a.repository?.toLowerCase().includes(q) ||
        a.model?.toLowerCase().includes(q),
    );
  }, [data?.automations, searchQuery]);

  const active = useMemo(() => filtered.filter((a) => a.enabled), [filtered]);
  const inactive = useMemo(
    () => filtered.filter((a) => !a.enabled),
    [filtered],
  );

  const handleToggle = (id: string, currentEnabled: boolean) => {
    toggleMutation.mutate({ id, enabled: !currentEnabled });
  };

  const handleDeleteRequest = (id: string) => {
    const automation = data?.automations.find((a) => a.id === id);
    if (automation) {
      setDeleteTarget({ id, name: automation.name });
    }
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const hasMore = data ? data.total > data.automations.length : false;

  // Show loading state while checking health
  if (isHealthLoading) {
    return (
      <div className="min-h-full">
        <div className="p-6 max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold text-content">
            {t(I18nKey.AUTOMATIONS$TITLE)}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t(I18nKey.AUTOMATIONS$SUBTITLE)}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <AutomationCardSkeleton key={`skeleton-${String(i)}`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Show backend not configured state if health check failed
  if (!isBackendHealthy) {
    return (
      <div className="min-h-full">
        <div className="p-6 max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold text-content">
            {t(I18nKey.AUTOMATIONS$TITLE)}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t(I18nKey.AUTOMATIONS$SUBTITLE)}
          </p>
          <BackendNotConfigured onRetry={refetchHealth} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <h1 className="text-xl font-semibold text-content">
          {t(I18nKey.AUTOMATIONS$TITLE)}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {t(I18nKey.AUTOMATIONS$SUBTITLE)}
        </p>

        {/* Search */}
        <div className="mt-6">
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
        </div>

        {/* Content */}
        <div className="mt-6 flex flex-col gap-6">
          {isLoading && (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <AutomationCardSkeleton key={`skeleton-${String(i)}`} />
              ))}
            </div>
          )}

          {isError && !isLoading && <ErrorState onRetry={refetch} />}

          {!isLoading && !isError && data?.automations.length === 0 && (
            <EmptyState />
          )}

          {!isLoading && !isError && data && data.automations.length > 0 && (
            <>
              {/* Collapsible creation instructions at the top */}
              <CreateInstructions collapsible />

              <AutomationGroup
                title={t(I18nKey.AUTOMATIONS$ACTIVE)}
                count={active.length}
                automations={active}
                onToggle={handleToggle}
                onDelete={handleDeleteRequest}
              />
              <AutomationGroup
                title={t(I18nKey.AUTOMATIONS$INACTIVE)}
                count={inactive.length}
                automations={inactive}
                onToggle={handleToggle}
                onDelete={handleDeleteRequest}
              />

              {hasMore && (
                <button
                  type="button"
                  onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
                  className="self-center rounded-lg border border-[var(--oh-border)] px-6 py-2 text-sm text-white hover:bg-surface-raised"
                >
                  {t(I18nKey.AUTOMATIONS$LOAD_MORE)}
                </button>
              )}
            </>
          )}
        </div>

        {/* Delete confirmation modal */}
        <DeleteConfirmationModal
          automationName={deleteTarget?.name ?? ""}
          isOpen={deleteTarget !== null}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </div>
  );
}
