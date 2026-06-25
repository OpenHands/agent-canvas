import type { LocalWorkspace } from "#/types/workspace";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderBrowserModal } from "#/components/features/home/workspace-dropdown/folder-browser-modal";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useUpdateWorkManifest } from "#/hooks/mutation/use-update-work-manifest";
import { I18nKey } from "#/i18n/declaration";
import type { WorkManifest } from "#/types/work-manifest";

interface WorkWorkspaceSetupProps {
  manifest: WorkManifest;
}

export function WorkWorkspaceSetup({ manifest }: WorkWorkspaceSetupProps) {
  const { t } = useTranslation("openhands");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { mutate: updateManifest, isPending } = useUpdateWorkManifest();
  const [selectedFolders, setSelectedFolders] = useState<string[]>(
    manifest.grantedFolders,
  );

  const handleAddFolders = (items: LocalWorkspace[]) => {
    const next = Array.from(
      new Set([...selectedFolders, ...items.map((item) => item.path)]),
    );
    setSelectedFolders(next);
    setIsPickerOpen(false);
  };

  const handleSave = () => {
    const primary = selectedFolders[0];
    if (!primary) {
      return;
    }
    updateManifest({
      ...manifest,
      grantedFolders: selectedFolders,
      deliverablesPath: `${primary.replace(/\/+$/, "")}/Work Deliverables`,
    });
  };

  return (
    <div
      data-testid="work-workspace-setup"
      className="rounded-lg border border-[var(--oh-border-input)] bg-[var(--oh-surface-raised)] px-4 py-3 text-sm text-tertiary-light"
    >
      <p className="font-medium text-foreground">
        {t(I18nKey.WORK$SETUP_TITLE)}
      </p>
      <p className="mt-1">{t(I18nKey.WORK$SETUP_BODY)}</p>

      {selectedFolders.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs">
          {selectedFolders.map((folder) => (
            <li key={folder} className="truncate font-mono">
              {folder}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <BrandButton
          type="button"
          variant="secondary"
          testId="work-setup-add-folders"
          onClick={() => setIsPickerOpen(true)}
        >
          {t(I18nKey.WORK$SETUP_ADD_FOLDERS)}
        </BrandButton>
        <BrandButton
          type="button"
          variant="primary"
          testId="work-setup-save"
          isDisabled={selectedFolders.length === 0 || isPending}
          onClick={handleSave}
        >
          {t(I18nKey.WORK$SETUP_SAVE)}
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
