import { PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useSidebarMobileNav } from "./sidebar-mobile-nav-context";

const mobileTopBarButtonClassName = cn(
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
  "text-[var(--oh-muted)] transition-colors",
  "hover:bg-[var(--oh-surface-raised)] hover:text-white",
);

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
      className={mobileTopBarButtonClassName}
    >
      <PanelLeft width={18} height={18} aria-hidden />
    </button>
  );
}
