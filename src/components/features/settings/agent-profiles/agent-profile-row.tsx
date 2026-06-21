import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentProfileSummary } from "#/api/agent-profiles-service/agent-profiles-service.api";
import { ProfileActionsMenu } from "#/components/features/settings/llm-profiles/profile-actions-menu";
import { I18nKey } from "#/i18n/declaration";
import { EllipsisButton } from "#/components/features/conversation-panel/ellipsis-button";
import { BrandBadge } from "#/components/shared/badge";
import { cn } from "#/utils/utils";
import {
  settingsListIconActionButtonClassName,
  settingsListRowClassName,
} from "#/utils/settings-list-classes";

interface AgentProfileRowProps {
  profile: AgentProfileSummary;
  isActive: boolean;
  onActivate: (profile: AgentProfileSummary) => void;
  onEdit: (profile: AgentProfileSummary) => void;
  onRename: (profile: AgentProfileSummary) => void;
  onDuplicate: (profile: AgentProfileSummary) => void;
  onDelete: (profile: AgentProfileSummary) => void;
  isActivating: boolean;
}

export function AgentProfileRow({
  profile,
  isActive,
  onActivate,
  onEdit,
  onRename,
  onDuplicate,
  onDelete,
  isActivating,
}: AgentProfileRowProps) {
  const { t } = useTranslation("openhands");
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const kindLabel =
    profile.agent_kind === "acp"
      ? t(I18nKey.SETTINGS$AGENT_TYPE_ACP)
      : t(I18nKey.SETTINGS$AGENT_TYPE_OPENHANDS);

  return (
    <div
      data-testid="agent-profile-row"
      className={cn(settingsListRowClassName, "justify-between gap-3")}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="min-w-0 max-w-full truncate text-sm font-medium text-white"
          title={profile.name}
        >
          {profile.name}
        </span>
        <span
          data-testid="agent-profile-kind-badge"
          className="shrink-0 whitespace-nowrap rounded-full border border-[#3D4046] px-2 py-0.5 text-xs text-[var(--oh-muted)]"
        >
          {kindLabel}
        </span>
        {profile.agent_kind === "openhands" && profile.llm_profile_ref ? (
          <span
            className="min-w-0 max-w-full truncate text-sm text-[var(--oh-muted)]"
            title={profile.llm_profile_ref}
          >
            {profile.llm_profile_ref}
          </span>
        ) : null}
        {isActive && (
          <BrandBadge
            className="shrink-0 whitespace-nowrap px-2.5 py-1 text-xs"
            data-testid="agent-profile-active-badge"
          >
            {t(I18nKey.SETTINGS$PROFILE_ACTIVE)}
          </BrandBadge>
        )}
      </div>
      <div className="relative shrink-0">
        <EllipsisButton
          ref={triggerRef}
          onClick={() => setMenuOpen((open) => !open)}
          ariaLabel={t(I18nKey.SETTINGS$PROFILE_MENU)}
          testId="agent-profile-menu-trigger"
          className={settingsListIconActionButtonClassName}
        />
        {menuOpen && (
          <ProfileActionsMenu
            anchorRef={triggerRef}
            onEdit={() => onEdit(profile)}
            onRename={() => onRename(profile)}
            onDuplicate={() => onDuplicate(profile)}
            onSetActive={() => onActivate(profile)}
            onDelete={() => onDelete(profile)}
            isActive={isActive}
            isActivating={isActivating}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
