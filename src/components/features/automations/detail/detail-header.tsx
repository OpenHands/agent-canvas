import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import type { Automation } from "#/types/automation";
import { ToggleSwitch } from "#/components/features/automations/toggle-switch";
import { KebabMenu } from "#/components/features/automations/kebab-menu";
import PowerIcon from "#/icons/power.svg?react";
import TrashIcon from "#/icons/trash.svg?react";
import EditIcon from "#/icons/u-edit.svg?react";
import { useHasPermission } from "#/hooks/use-has-permission";
import { ActiveStatusBadge } from "./active-status-badge";

interface DetailHeaderProps {
  automation: Automation;
  onToggle: () => void;
  /**
   * When provided, the kebab menu shows an Edit entry. Omitted for cloud
   * backends where the Edit feature is not supported in MVP.
   */
  onEdit?: () => void;
  onDelete: () => void;
}

export function DetailHeader({
  automation,
  onToggle,
  onEdit,
  onDelete,
}: DetailHeaderProps) {
  const { t } = useTranslation("openhands");
  const canManage = useHasPermission("manage_automations");

  const kebabItems = [
    ...(onEdit
      ? [
          {
            label: t(I18nKey.AUTOMATIONS$EDIT),
            icon: <EditIcon className="size-4" />,
            onClick: onEdit,
          },
        ]
      : []),
    {
      label: automation.enabled
        ? t(I18nKey.AUTOMATIONS$TURN_OFF)
        : t(I18nKey.AUTOMATIONS$TURN_ON),
      icon: <PowerIcon className="size-4" />,
      onClick: onToggle,
    },
    {
      label: t(I18nKey.AUTOMATIONS$DELETE),
      icon: <TrashIcon className="size-4" />,
      onClick: onDelete,
      variant: "danger" as const,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-content">
            {automation.name}
          </h1>
          <ActiveStatusBadge active={automation.enabled} />
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <ToggleSwitch
              enabled={automation.enabled}
              label={
                automation.enabled
                  ? t(I18nKey.AUTOMATIONS$TURN_OFF)
                  : t(I18nKey.AUTOMATIONS$TURN_ON)
              }
              onToggle={onToggle}
            />
          )}
          {canManage && <KebabMenu items={kebabItems} />}
        </div>
      </div>
    </div>
  );
}
