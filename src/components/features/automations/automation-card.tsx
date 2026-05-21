import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { Automation } from "#/types/automation";
import AutomationService from "#/api/automation-service/automation-service.api";
import { ToggleSwitch } from "./toggle-switch";
import { MetadataChip } from "./metadata-chip";
import { KebabMenu } from "./kebab-menu";
import type { KebabMenuItem } from "./kebab-menu";
import { useHasPermission } from "#/hooks/use-has-permission";
import { useNavigation } from "#/context/navigation-context";
import FolderIcon from "#/icons/folder.svg?react";
import ClockIcon from "#/icons/clock.svg?react";
import SparkleIcon from "#/icons/sparkle.svg?react";
import PowerIcon from "#/icons/power.svg?react";
import DownloadIcon from "#/icons/download.svg?react";
import TrashIcon from "#/icons/trash.svg?react";
import EditIcon from "#/icons/u-edit.svg?react";

interface AutomationCardProps {
  automation: Automation;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
}

export function AutomationCard({
  automation,
  onToggle,
  onDelete,
  onEdit,
}: AutomationCardProps) {
  const { navigate } = useNavigation();
  const { t } = useTranslation("openhands");
  const canManage = useHasPermission("manage_automations");

  const scheduleLabel =
    automation.trigger.schedule_human || automation.trigger.type;

  const menuItems: KebabMenuItem[] = [
    ...(onEdit
      ? [
          {
            label: t(I18nKey.AUTOMATIONS$EDIT),
            icon: <EditIcon className="size-4" />,
            onClick: () => onEdit(automation.id),
          },
        ]
      : []),
    {
      label: automation.enabled
        ? t(I18nKey.AUTOMATIONS$TURN_OFF)
        : t(I18nKey.AUTOMATIONS$TURN_ON),
      icon: <PowerIcon className="size-4" />,
      onClick: () => onToggle(automation.id, automation.enabled),
    },
    {
      label: t(I18nKey.AUTOMATIONS$DOWNLOAD_TARBALL),
      icon: <DownloadIcon className="size-4" />,
      onClick: () => {
        AutomationService.downloadTarball(automation.id, automation.name);
      },
    },
    {
      label: t(I18nKey.AUTOMATIONS$DELETE),
      icon: <TrashIcon className="size-4" />,
      onClick: () => onDelete(automation.id),
      variant: "danger",
    },
  ];

  const handleCardClick = () => {
    navigate?.(`/automations/${automation.id}`);
  };

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleCardClick();
      }}
      className="cursor-pointer rounded-2xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-5 transition-colors hover:border-[var(--oh-border)]"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-white">
            {automation.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted">
            {automation.prompt}
          </p>
        </div>

        <div className="ml-4 flex shrink-0 items-center gap-2">
          {canManage && (
            <ToggleSwitch
              enabled={automation.enabled}
              label={`Toggle ${automation.name}`}
              onToggle={() => onToggle(automation.id, automation.enabled)}
            />
          )}
          {canManage && <KebabMenu items={menuItems} />}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {automation.repository && (
          <MetadataChip
            icon={<FolderIcon className="size-3.5" />}
            label={automation.repository}
          />
        )}
        <MetadataChip
          icon={<ClockIcon className="size-3.5" />}
          label={scheduleLabel}
        />
        {automation.model && (
          <MetadataChip
            icon={<SparkleIcon className="size-3.5" />}
            label={automation.model}
          />
        )}
      </div>
    </div>
  );
}
