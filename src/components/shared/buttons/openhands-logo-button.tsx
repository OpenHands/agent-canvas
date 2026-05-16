import OpenHandsLogo from "#/assets/branding/openhands-logo.svg?react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { cn } from "#/utils/utils";

/* rbren branch: useTranslation / I18nKey imports dropped — brand tooltip
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
};

export function OpenHandsLogoButton({
  className,
  logoClassName,
  logoWidth = DEFAULT_LOGO_WIDTH,
  logoHeight = DEFAULT_LOGO_HEIGHT,
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
        {/* rbren branch: tint logo with Toffee Brown (#9D684B), the
            rbren-earth theme's primary accent. Targets only the
            originally-white SVG paths so the transparent face cut-out
            stays transparent. */}
        <OpenHandsLogo
          width={logoWidth}
          height={logoHeight}
          className={cn(
            "shrink-0 [&_path[fill='white']]:fill-[#9D684B]",
            logoClassName,
          )}
        />
      </NavigationLink>
    </StyledTooltip>
  );
}
