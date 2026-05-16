import OpenHandsLogo from "#/assets/branding/openhands-logo.svg?react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { cn } from "#/utils/utils";

/* rbren's mod: useTranslation / I18nKey imports dropped — brand tooltip
   and aria label are now hardcoded to "rbren's mod" below. Original lines:
   import { useTranslation } from "react-i18next";
   import { I18nKey } from "#/i18n/declaration";
   const { t } = useTranslation("openhands");
   const tooltipText = t(I18nKey.BRANDING$OPENHANDS);
   const ariaLabel = t(I18nKey.BRANDING$OPENHANDS_LOGO); */

const DEFAULT_LOGO_WIDTH = 46;
const DEFAULT_LOGO_HEIGHT = 30;

export type OpenHandsLogoButtonProps = {
  className?: string;
  /** Applied to the root `<svg>` (e.g. `max-w-none` so Tailwind preflight doesn’t clamp wide marks inside a narrow flex slot). */
  logoClassName?: string;
  logoWidth?: number;
  logoHeight?: number;
  /* rbren's mod: compact mode skips the "rbren's mod" wordmark next to the
     logo. Used by the collapsed 64px sidebar rail where there's no room. */
  compact?: boolean;
};

export function OpenHandsLogoButton({
  className,
  logoClassName,
  logoWidth = DEFAULT_LOGO_WIDTH,
  logoHeight = DEFAULT_LOGO_HEIGHT,
  compact = false,
}: OpenHandsLogoButtonProps = {}) {
  const tooltipText = "rbren's mod";
  const ariaLabel = "rbren's mod logo";

  return (
    <StyledTooltip content={tooltipText}>
      <NavigationLink
        to="/conversations"
        aria-label={ariaLabel}
        className={cn(className)}
      >
        <span className="flex items-center gap-2">
          {/* rbren's mod: tint logo with var(--oh-muted), matching the
              inactive color of the sidebar nav icons (Code / Customize /
              Automate). Targets only originally-white SVG paths so the
              transparent face cut-out stays transparent. */}
          <OpenHandsLogo
            width={logoWidth}
            height={logoHeight}
            className={cn(
              "shrink-0 [&_path[fill='white']]:fill-[var(--oh-muted)]",
              logoClassName,
            )}
          />
          {/* rbren's mod: wordmark shown next to the logo in expanded mode. */}
          {!compact && (
            <span className="text-sm font-medium text-[var(--oh-muted)] whitespace-nowrap">
              rbren&apos;s mod
            </span>
          )}
        </span>
      </NavigationLink>
    </StyledTooltip>
  );
}
