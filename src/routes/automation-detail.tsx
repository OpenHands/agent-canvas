import { useState } from "react";
import { useParams } from "react-router";
import { isAxiosError } from "axios";
import { useAutomationDetail } from "#/hooks/query/use-automation-detail";
import {
  useToggleAutomation,
  useDeleteAutomation,
} from "#/hooks/query/use-automations";
import { useNavigation } from "#/context/navigation-context";
import { BackLink } from "#/components/features/automations/detail/back-link";
import { DetailHeader } from "#/components/features/automations/detail/detail-header";
import { PromptSection } from "#/components/features/automations/detail/prompt-section";
import { ConfigurationSection } from "#/components/features/automations/detail/configuration-section";
import { PluginsSection } from "#/components/features/automations/detail/plugins-section";
import { ActivitySection } from "#/components/features/automations/detail/activity-section";
import { ActivityLogSection } from "#/components/features/automations/detail/activity-log-section";
import { DetailSkeleton } from "#/components/features/automations/detail/detail-skeleton";
import { NotFoundState } from "#/components/features/automations/detail/not-found-state";
import { ErrorState } from "#/components/features/automations/error-state";
import { DeleteConfirmationModal } from "#/components/features/automations/delete-confirmation-modal";

export default function AutomationDetail() {
  const { automationId } = useParams();
  const { navigate } = useNavigation();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const {
    data: automation,
    isLoading,
    isError,
    error,
    refetch,
  } = useAutomationDetail(automationId ?? "");

  const toggleMutation = useToggleAutomation();
  const deleteMutation = useDeleteAutomation();

  const is404 =
    isError && isAxiosError(error) && error.response?.status === 404;

  if (isLoading) {
    return (
      <div className="min-h-full bg-surface">
        <div className="p-6 max-w-4xl mx-auto">
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (is404) {
    return (
      <div className="min-h-full bg-surface">
        <div className="p-6 max-w-4xl mx-auto">
          <NotFoundState />
        </div>
      </div>
    );
  }

  if (isError || !automation) {
    return (
      <div className="min-h-full bg-surface">
        <div className="p-6 max-w-4xl mx-auto">
          <ErrorState onRetry={() => refetch()} />
        </div>
      </div>
    );
  }

  const handleToggle = () => {
    toggleMutation.mutate({
      id: automation.id,
      enabled: !automation.enabled,
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate(automation.id, {
      onSuccess: () => {
        navigate?.("/automations");
      },
    });
  };

  return (
    <div className="min-h-full bg-surface">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex flex-col gap-4">
          <BackLink />
          <DetailHeader
            automation={automation}
            onToggle={handleToggle}
            onDelete={() => setShowDeleteModal(true)}
          />
          {automation.prompt && <PromptSection prompt={automation.prompt} />}
          <ConfigurationSection automation={automation} />
          {automation.plugins && automation.plugins.length > 0 && (
            <PluginsSection plugins={automation.plugins} />
          )}
          <ActivitySection
            createdAt={automation.created_at}
            lastRunAt={automation.last_triggered_at}
          />
          <ActivityLogSection automationId={automation.id} />
          <DeleteConfirmationModal
            automationName={automation.name}
            isOpen={showDeleteModal}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteModal(false)}
          />
        </div>
      </div>
    </div>
  );
}
