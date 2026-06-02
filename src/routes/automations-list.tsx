import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import { I18nKey } from "#/i18n/declaration";
import {
  displaySuccessToast,
  displayErrorToast,
} from "#/utils/custom-toast-handlers";
import {
  useAutomations,
  useToggleAutomation,
  useDeleteAutomation,
  useDispatchAutomation,
} from "#/hooks/query/use-automations";
import { useAutomationHealth } from "#/hooks/query/use-automation-health";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { SearchInput } from "#/components/features/automations/search-input";
import { AutomationGroup } from "#/components/features/automations/automation-group";
import { AutomationViewToggle } from "#/components/features/automations/automation-view-toggle";
import {
  readStoredAutomationViewMode,
  writeStoredAutomationViewMode,
  type AutomationViewMode,
} from "#/components/features/automations/automation-view-mode";
import { AutomationCardSkeleton } from "#/components/features/automations/automation-card-skeleton";
import { EmptyState } from "#/components/features/automations/empty-state";
import { ErrorState } from "#/components/features/automations/error-state";
import { BackendNotConfigured } from "#/components/features/automations/backend-not-configured";
import { DeleteConfirmationModal } from "#/components/features/automations/delete-confirmation-modal";
import { EditAutomationModal } from "#/components/features/automations/detail/edit-automation-modal";
import { AddAutomationModal } from "#/components/features/automations/add-automation-modal";
import { RecommendedAutomationsLauncher } from "#/components/features/automations/recommended-automations-launcher";
import { BrandButton } from "#/components/features/settings/brand-button";
import { trackEvent } from "#/services/telemetry";
import type { Automation } from "#/types/automation";

const PAGE_SIZE = 50;

export default function AutomationsList() {
  const { t } = useTranslation("openhands");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<AutomationViewMode>(() =>
    readStoredAutomationViewMode(),
  );
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [editTarget, setEditTarget] = useState<Automation | null>(null);
  const [isAddAutomationOpen, setIsAddAutomationOpen] = useState(false);

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
  const dispatchMutation = useDispatchAutomation();

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
    const willEnable = !currentEnabled;
    toggleMutation.mutate({ id, enabled: willEnable });
    if (willEnable) {
      const automation = data?.automations.find((a) => a.id === id);
      trackEvent("prebuilt_automation_enabled", {
        automation_id: id,
        automation_name: automation?.name ?? id,
      });
    }
  };

  const handleRunNow = (id: string) => {
    dispatchMutation.mutate(id, {
      onSuccess: () => {
        displaySuccessToast(t(I18nKey.AUTOMATIONS$RUN_NOW_SUCCESS));
      },
      onError: (error) => {
        const message = isAxiosError(error)
          ? (error.response?.data as { message?: string } | undefined)
              ?.message ||
            error.message ||
            t(I18nKey.AUTOMATIONS$RUN_NOW_ERROR)
          : (error as Error).message || t(I18nKey.AUTOMATIONS$RUN_NOW_ERROR);
        displayErrorToast(message);
      },
    });
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

  const handleViewModeChange = useCallback((view: AutomationViewMode) => {
    setViewMode(view);
    writeStoredAutomationViewMode(view);
  }, []);

  const hasMore = data ? data.total > data.automations.length : false;
  const hasNoAutomations =
    !isLoading && !isError && data?.automations.length === 0;

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
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-content">
              {t(I18nKey.AUTOMATIONS$TITLE)}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {t(I18nKey.AUTOMATIONS$SUBTITLE)}
            </p>
          </div>
          <BrandButton
            type="button"
            variant="secondary"
            testId="automations-add-automation"
            className="shrink-0 whitespace-nowrap"
            onClick={() => setIsAddAutomationOpen(true)}
          >
            {t(I18nKey.AUTOMATIONS$ADD_AUTOMATION)}
          </BrandButton>
        </div>

        {/* Search */}
        <div className="mt-6 flex items-stretch gap-2">
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
          <AutomationViewToggle
            view={viewMode}
            onChange={handleViewModeChange}
            disabled={hasNoAutomations}
          />
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

          {hasNoAutomations && <EmptyState />}

          {!isLoading && !isError && data && data.automations.length > 0 && (
            <>
              <AutomationGroup
                title={t(I18nKey.AUTOMATIONS$ACTIVE)}
                count={activeAutomations.length}
                automations={activeAutomations}
                view={viewMode}
                onToggle={handleToggle}
                onRunNow={handleRunNow}
                runPendingId={
                  dispatchMutation.isPending
                    ? (dispatchMutation.variables ?? null)
                    : null
                }
                onDelete={handleDeleteRequest}
                onEdit={canEdit ? handleEditRequest : undefined}
              />
              <AutomationGroup
                title={t(I18nKey.AUTOMATIONS$INACTIVE)}
                count={inactive.length}
                automations={inactive}
                view={viewMode}
                onToggle={handleToggle}
                onRunNow={handleRunNow}
                runPendingId={
                  dispatchMutation.isPending
                    ? (dispatchMutation.variables ?? null)
                    : null
                }
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

        <AddAutomationModal
          isOpen={isAddAutomationOpen}
          onClose={() => setIsAddAutomationOpen(false)}
        />
      </div>
    </div>
  );
}
