import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { useSidebarMobileNav } from "./sidebar-mobile-nav-context";

export function SidebarMobileMenuBar() {
  const { t } = useTranslation("openhands");
  const { isOpen, toggle } = useSidebarMobileNav();

  return (
    <header
      className="flex md:hidden h-12 shrink-0 items-center border-b border-[var(--oh-border)] px-2"
      aria-label={t(I18nKey.SIDEBAR$NAVIGATION_LABEL)}
    >
      <button
        type="button"
        data-testid="sidebar-mobile-menu-toggle"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-label={
          isOpen ? t(I18nKey.SIDEBAR$CLOSE_MENU) : t(I18nKey.SIDEBAR$OPEN_MENU)
        }
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md",
          "text-[var(--oh-muted)] transition-colors",
          "hover:bg-[var(--oh-surface-raised)] hover:text-white",
        )}
      >
        <ChevronLeft width={18} height={18} aria-hidden />
      </button>
    </header>
  );
}
