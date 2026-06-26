import type { LocalWorkspace } from "#/types/workspace";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderBrowserModal } from "#/components/features/home/workspace-dropdown/folder-browser-modal";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { WorkToolToggles } from "#/components/features/work/work-tool-toggles";
import { useUpdateWorkManifest } from "#/hooks/mutation/use-update-work-manifest";
import { useWorkRuntimeHealth } from "#/hooks/query/use-work-runtime-health";
import { I18nKey } from "#/i18n/declaration";
import type { WorkManifest } from "#/types/work-manifest";
import type { WorkOptionalToolId } from "#/types/work-tools";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";

interface WorkSettingsFormProps {
  manifest: WorkManifest;
  variant?: "full" | "compact";
  testIdPrefix?: string;
  onSaved?: () => void;
}

function defaultDeliverablesPath(primaryFolder: string): string {
  return `${primaryFolder.replace(/\/+$/, "")}/Work Deliverables`;
}

const EXAMPLE_WORKSPACE_PATH = "/path/to/workspace";
const DELIVERABLES_PATH_PLACEHOLDER = defaultDeliverablesPath(
  EXAMPLE_WORKSPACE_PATH,
);

export function WorkSettingsForm({
  manifest,
  variant = "full",
  testIdPrefix = "work-settings",
  onSaved,
}: WorkSettingsFormProps) {
  const { t } = useTranslation("openhands");
  const isCompact = variant === "compact";
  const { data: healthData, isSuccess: isHealthResolved } =
    useWorkRuntimeHealth();
  const { mutate: updateManifest, isPending } = useUpdateWorkManifest();

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(manifest.name);
  const [selectedFolders, setSelectedFolders] = useState<string[]>(
    manifest.grantedFolders,
  );
  const [deliverablesPath, setDeliverablesPath] = useState(
    manifest.deliverablesPath,
  );
  const [defaultOptionalTools, setDefaultOptionalTools] = useState<
    WorkOptionalToolId[]
  >(manifest.defaultOptionalTools ?? []);

  useEffect(() => {
    setWorkspaceName(manifest.name);
    setSelectedFolders(manifest.grantedFolders);
    setDeliverablesPath(manifest.deliverablesPath);
    setDefaultOptionalTools(manifest.defaultOptionalTools ?? []);
  }, [manifest]);

  const runtimeReady = healthData?.status === "ok";
  const showRuntimeUnavailable = isHealthResolved && !runtimeReady;

  const handleAddFolders = (items: LocalWorkspace[]) => {
    const next = Array.from(
      new Set([...selectedFolders, ...items.map((item) => item.path)]),
    );
    setSelectedFolders(next);
    if (isCompact && next[0]) {
      setDeliverablesPath(defaultDeliverablesPath(next[0]));
    }
    setIsPickerOpen(false);
  };

  const handleRemoveFolder = (folder: string) => {
    setSelectedFolders((current) =>
      current.filter((entry) => entry !== folder),
    );
  };

  const handleSave = () => {
    const primary = selectedFolders[0];
    if (!primary) {
      return;
    }

    const resolvedDeliverables = isCompact
      ? defaultDeliverablesPath(primary)
      : deliverablesPath.trim() || defaultDeliverablesPath(primary);

    updateManifest(
      {
        ...manifest,
        name: workspaceName.trim() || manifest.name,
        grantedFolders: selectedFolders,
        deliverablesPath: resolvedDeliverables,
        defaultOptionalTools,
      },
      {
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
          onSaved?.();
        },
        onError: (error) => {
          displayErrorToast(
            error instanceof Error ? error.message : t(I18nKey.ERROR$GENERIC),
          );
        },
      },
    );
  };

  return (
    <div
      data-testid={`${testIdPrefix}-form`}
      className={cn(
        isCompact &&
          "rounded-lg border border-[var(--oh-border-input)] bg-[var(--oh-surface-raised)] px-4 py-3 text-sm text-tertiary-light",
      )}
    >
      {!isCompact && showRuntimeUnavailable ? (
        <p
          data-testid={`${testIdPrefix}-runtime-unavailable`}
          className="rounded-lg border border-[var(--oh-border-input)] bg-[var(--oh-surface-raised)] px-4 py-3 text-sm text-tertiary-light"
        >
          {t(I18nKey.WORK$RUNTIME_UNAVAILABLE)}
        </p>
      ) : null}

      {!isCompact ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">
            {t(I18nKey.WORK$SETTINGS_RUNTIME_TITLE)}
          </h3>
          <p
            data-testid={`${testIdPrefix}-runtime-status`}
            className="text-sm text-tertiary-light"
          >
            {runtimeReady
              ? t(I18nKey.WORK$SETTINGS_RUNTIME_OK)
              : t(I18nKey.WORK$SETTINGS_RUNTIME_UNAVAILABLE)}
          </p>
        </section>
      ) : null}

      <section className={cn("space-y-3", !isCompact && "mt-6")}>
        {!isCompact ? (
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {t(I18nKey.WORK$SETTINGS_WORKSPACE_TITLE)}
            </h3>
            <p className="mt-0.5 text-sm text-tertiary-light">
              {t(I18nKey.WORK$SETTINGS_FOLDERS_HELP)}
            </p>
          </div>
        ) : (
          <>
            <p className="font-medium text-foreground">
              {t(I18nKey.WORK$SETUP_TITLE)}
            </p>
            <p className="mt-1">{t(I18nKey.WORK$SETUP_BODY)}</p>
          </>
        )}

        {!isCompact ? (
          <SettingsInput
            testId={`${testIdPrefix}-workspace-name`}
            label={t(I18nKey.WORK$SETTINGS_WORKSPACE_NAME)}
            type="text"
            value={workspaceName}
            placeholder={t(I18nKey.WORK$SETTINGS_WORKSPACE_NAME_PLACEHOLDER)}
            onChange={setWorkspaceName}
          />
        ) : null}

        {selectedFolders.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {selectedFolders.map((folder) => (
              <li
                key={folder}
                className="flex items-center justify-between gap-2 rounded-md border border-[var(--oh-border-input)] px-2 py-1 font-mono"
              >
                <span className="truncate">{folder}</span>
                {!isCompact ? (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-tertiary-light hover:text-foreground"
                    data-testid={`${testIdPrefix}-remove-folder-${folder}`}
                    onClick={() => handleRemoveFolder(folder)}
                  >
                    {t(I18nKey.COMMON$REMOVE)}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {!isCompact ? (
          <SettingsInput
            testId={`${testIdPrefix}-deliverables-path`}
            label={t(I18nKey.WORK$SETTINGS_DELIVERABLES_LABEL)}
            type="text"
            value={deliverablesPath}
            placeholder={DELIVERABLES_PATH_PLACEHOLDER}
            onChange={setDeliverablesPath}
          />
        ) : null}

        {!isCompact ? (
          <p className="text-xs text-tertiary-light">
            {t(I18nKey.WORK$SETTINGS_DELIVERABLES_HELP)}
          </p>
        ) : null}
      </section>

      <section className={cn("space-y-2", !isCompact ? "mt-6" : "mt-4")}>
        <div>
          <p
            className={cn(
              isCompact
                ? "text-xs font-medium text-foreground"
                : "text-sm font-medium text-foreground",
            )}
          >
            {t(I18nKey.WORK$TOOLS_SETUP_TITLE)}
          </p>
          <p
            className={cn(
              "mt-0.5 text-tertiary-light",
              isCompact ? "text-xs" : "text-sm",
            )}
          >
            {t(I18nKey.WORK$TOOLS_SETUP_BODY)}
          </p>
        </div>
        <WorkToolToggles
          enabledOptionalToolIds={defaultOptionalTools}
          onChange={setDefaultOptionalTools}
          isDisabled={isPending}
          testIdPrefix={`${testIdPrefix}-tool`}
        />
      </section>

      <div className={cn("flex flex-wrap gap-2", !isCompact ? "mt-6" : "mt-3")}>
        <BrandButton
          type="button"
          variant="secondary"
          testId={`${testIdPrefix}-add-folders`}
          onClick={() => setIsPickerOpen(true)}
        >
          {t(I18nKey.WORK$SETUP_ADD_FOLDERS)}
        </BrandButton>
        <BrandButton
          type="button"
          variant="primary"
          testId={`${testIdPrefix}-save`}
          isDisabled={selectedFolders.length === 0 || isPending}
          onClick={handleSave}
        >
          {t(isCompact ? I18nKey.WORK$SETUP_SAVE : I18nKey.WORK$SETTINGS_SAVE)}
        </BrandButton>
      </div>

      <FolderBrowserModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onAdd={handleAddFolders}
      />
    </div>
  );
}
