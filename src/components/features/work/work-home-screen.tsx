import { useTranslation } from "react-i18next";
import { useNavigation } from "#/context/navigation-context";
import { CustomChatInput } from "#/components/features/chat/custom-chat-input";
import { WorkModeCloudGuard } from "#/components/features/work/work-mode-cloud-guard";
import { WorkWorkspaceSetup } from "#/components/features/work/work-workspace-setup";
import { useModelInterceptor } from "#/hooks/chat/use-model-interceptor";
import { useCreateWorkTask } from "#/hooks/mutation/use-create-work-task";
import { useWorkManifest } from "#/hooks/query/use-work-manifest";
import { useWorkRuntimeHealth } from "#/hooks/query/use-work-runtime-health";
import { I18nKey } from "#/i18n/declaration";
import { isWorkManifestReady } from "#/types/work-manifest";
import {
  displayErrorToast,
  TOAST_OPTIONS,
} from "#/utils/custom-toast-handlers";
import toast from "react-hot-toast";

export function WorkHomeScreen() {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();
  const { data: healthData, isSuccess: isHealthResolved } =
    useWorkRuntimeHealth();
  const { data: manifest, isLoading: isManifestLoading } = useWorkManifest();
  const { mutate: createWorkTask, isPending } = useCreateWorkTask();

  const runtimeReady = healthData?.status === "ok";
  const showRuntimeUnavailable = isHealthResolved && !runtimeReady;
  const manifestReady = isWorkManifestReady(manifest);
  const composerDisabled =
    !runtimeReady || !manifestReady || isManifestLoading || isPending;

  const handleSubmit = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || composerDisabled) {
      return;
    }

    const toastId = toast.loading(t(I18nKey.WORK$CREATING_TASK), TOAST_OPTIONS);
    createWorkTask(
      { query: trimmed },
      {
        onSuccess: (data) => {
          toast.dismiss(toastId);
          navigate(`/work/tasks/${data.task_id}`);
        },
        onError: (error) => {
          toast.dismiss(toastId);
          displayErrorToast(
            error instanceof Error
              ? error.message
              : t(I18nKey.WORK$CREATE_FAILED),
          );
        },
      },
    );
  };

  const interceptedSubmit = useModelInterceptor(null, handleSubmit);

  return (
    <div
      data-testid="work-home-screen"
      className="custom-scrollbar-always flex h-full flex-col overflow-y-auto rounded-xl bg-transparent px-4 md:px-0 lg:px-[42px]"
    >
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center">
        <div className="flex w-full max-w-[800px] flex-col gap-4 md:px-4">
          <WorkModeCloudGuard />

          {showRuntimeUnavailable ? (
            <p
              data-testid="work-runtime-unavailable"
              className="rounded-lg border border-[var(--oh-border-input)] bg-[var(--oh-surface-raised)] px-4 py-3 text-sm text-tertiary-light"
            >
              {t(I18nKey.WORK$RUNTIME_UNAVAILABLE)}
            </p>
          ) : null}

          {runtimeReady && manifest && !manifestReady ? (
            <WorkWorkspaceSetup manifest={manifest} />
          ) : null}

          <div className="space-y-1 text-center">
            <h1 className="text-xl font-medium text-foreground">
              {t(I18nKey.WORK$HOME_TITLE)}
            </h1>
            <p className="text-sm text-tertiary-light">
              {t(I18nKey.WORK$HOME_DESCRIPTION)}
            </p>
          </div>

          <CustomChatInput
            onSubmit={interceptedSubmit}
            disabled={composerDisabled}
          />
        </div>
      </div>
    </div>
  );
}
