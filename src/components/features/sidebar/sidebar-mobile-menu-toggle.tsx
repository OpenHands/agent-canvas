import { PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  mobileTopBarIconButtonClassName,
  mobileTopBarIconClassName,
} from "#/utils/mobile-top-bar-icon-button-classes";
import { useSidebarMobileNav } from "./sidebar-mobile-nav-context";

export function SidebarMobileMenuToggle() {
  const { t } = useTranslation("openhands");
  const { isOpen, toggle } = useSidebarMobileNav();

  return (
    <button
      type="button"
      data-testid="sidebar-mobile-menu-toggle"
      onClick={toggle}
      aria-expanded={isOpen}
      aria-label={
        isOpen ? t(I18nKey.SIDEBAR$CLOSE_MENU) : t(I18nKey.SIDEBAR$OPEN_MENU)
      }
      className={mobileTopBarIconButtonClassName}
    >
      <PanelLeft
        size={20}
        className={mobileTopBarIconClassName}
        aria-hidden
        strokeWidth={2}
      />
    </button>
  );
}
