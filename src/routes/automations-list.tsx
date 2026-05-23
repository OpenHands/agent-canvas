import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  useAutomations,
  useToggleAutomation,
  useDeleteAutomation,
} from "#/hooks/query/use-automations";
import { useAutomationHealth } from "#/hooks/query/use-automation-health";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { SearchInput } from "#/components/features/automations/search-input";
import { AutomationGroup } from "#/components/features/automations/automation-group";
import { AutomationCardSkeleton } from "#/components/features/automations/automation-card-skeleton";
import { EmptyState } from "#/components/features/automations/empty-state";
import { ErrorState } from "#/components/features/automations/error-state";
import { BackendNotConfigured } from "#/components/features/automations/backend-not-configured";
import { DeleteConfirmationModal } from "#/components/features/automations/delete-confirmation-modal";
import { EditAutomationModal } from "#/components/features/automations/detail/edit-automation-modal";
import { CreateInstructions } from "#/components/features/automations/create-instructions";
import { RecommendedAutomationsLauncher } from "#/components/features/automations/recommended-automations-launcher";
import type { Automation } from "#/types/automation";

const PAGE_SIZE = 50;

export default function AutomationsList() {
  const { t } = useTranslation("openhands");
  const [searchQuery, setSearchQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [editTarget, setEditTarget] = useState<Automation | null>(null);

  const active = useActiveBackend();
  // Edit is a local-backend-only feature in MVP — cloud automations
  // are managed elsewhere and we don't yet surface them here.
  const canEdit = active.backend.kind === "local";

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

  const activeAutomations = useMemo(
    () => filtered.filter((a) => a.enabled),
    [filtered],
  );
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

  const handleEditRequest = (id: string) => {
    const automation = data?.automations.find((a) => a.id === id);
    if (automation) {
      setEditTarget(automation);
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
          <h1 className="text-xl font-medium text-content">
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
          <h1 className="text-xl font-medium text-content">
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
        <h1 className="text-xl font-medium text-content">
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
                count={activeAutomations.length}
                automations={activeAutomations}
                onToggle={handleToggle}
                onDelete={handleDeleteRequest}
                onEdit={canEdit ? handleEditRequest : undefined}
              />
              <AutomationGroup
                title={t(I18nKey.AUTOMATIONS$INACTIVE)}
                count={inactive.length}
                automations={inactive}
                onToggle={handleToggle}
                onDelete={handleDeleteRequest}
                onEdit={canEdit ? handleEditRequest : undefined}
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

        <div className="mt-6">
          <RecommendedAutomationsLauncher query={searchQuery} />
        </div>

        {/* Delete confirmation modal */}
        <DeleteConfirmationModal
          automationName={deleteTarget?.name ?? ""}
          isOpen={deleteTarget !== null}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />

        {/* Edit modal — local backends only */}
        {editTarget && (
          <EditAutomationModal
            automation={editTarget}
            isOpen={editTarget !== null}
            onClose={() => setEditTarget(null)}
          />
        )}
      </div>
    </div>
  );
}
