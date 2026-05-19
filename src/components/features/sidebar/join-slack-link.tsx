import { useTranslation } from "react-i18next";
import { SiSlack } from "react-icons/si";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { I18nKey } from "#/i18n/declaration";
import { OPENHANDS_SLACK_INVITE_URL } from "#/utils/constants";
import { cn } from "#/utils/utils";

const ICON_SIZE = 18;

interface JoinSlackLinkProps {
  collapsed?: boolean;
}

export function JoinSlackLink({ collapsed = false }: JoinSlackLinkProps) {
  const { t } = useTranslation("openhands");
  const label = t(I18nKey.SIDEBAR$JOIN_SLACK);

  const link = (
    <a
      href={OPENHANDS_SLACK_INVITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="join-slack-link"
      aria-label={label}
      className={cn(
        "flex items-center gap-2 rounded-md transition-colors text-sm leading-5",
        "text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
        collapsed
          ? "justify-center w-10 h-10 p-0 mx-auto"
          : "px-2 py-2 w-full",
      )}
    >
      <span className="shrink-0 flex items-center justify-center">
        <SiSlack width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </a>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <StyledTooltip content={label} placement="right">
      {link}
    </StyledTooltip>
  );
}
