import { useState } from "react";
import { MobileHeader } from "./mobile-header";
import { SettingsNavigation } from "./settings-navigation";
import { SettingsNavRenderedItem } from "#/hooks/use-settings-nav-items";

interface SettingsLayoutProps {
  children: React.ReactNode;
  navigationItems: SettingsNavRenderedItem[];
}

export function SettingsLayout({
  children,
  navigationItems,
}: SettingsLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex flex-col h-full px-[14px]">
      {/* Mobile header */}
      <MobileHeader
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMenu={toggleMobileMenu}
      />
      {/* Desktop: one vertical scroll for nav + content so the sidebar can
          stay sticky (`md:sticky` on the desktop aside). */}
      <div className="flex min-h-0 flex-1 items-start gap-10 overflow-y-auto custom-scrollbar-always">
        {/* Navigation */}
        <SettingsNavigation
          isMobileMenuOpen={isMobileMenuOpen}
          onCloseMobileMenu={closeMobileMenu}
          navigationItems={navigationItems}
        />
        {/* Main content: same max width as extensions settings pages, centered in
            the flexible area beside the nav. */}
        <main className="flex min-w-0 flex-1 flex-col md:pt-8">
          <div className="mx-auto w-full min-w-0 max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
