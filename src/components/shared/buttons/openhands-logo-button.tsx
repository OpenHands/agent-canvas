import OpenHandsLogo from "#/assets/branding/openhands-logo.svg?react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";

/* rbren branch: useTranslation / I18nKey imports dropped — brand tooltip
   and aria label are now hardcoded to "rbren's mod" below. Original lines:
   import { useTranslation } from "react-i18next";
   import { I18nKey } from "#/i18n/declaration";
   const { t } = useTranslation("openhands");
   const tooltipText = t(I18nKey.BRANDING$OPENHANDS);
   const ariaLabel = t(I18nKey.BRANDING$OPENHANDS_LOGO); */
export function OpenHandsLogoButton() {
  const tooltipText = "rbren's mod";
  const ariaLabel = "rbren's mod logo";

  return (
    <StyledTooltip content={tooltipText}>
      <NavigationLink to="/conversations" aria-label={ariaLabel}>
        {/* rbren branch: tint logo with Toffee Brown (#9D684B), the
            rbren-earth theme's primary accent. Targets only the
            originally-white SVG paths so the transparent face cut-out
            stays transparent. */}
        <OpenHandsLogo
          width={46}
          height={30}
          className="[&_path[fill='white']]:fill-[#9D684B]"
        />
      </NavigationLink>
    </StyledTooltip>
  );
}
