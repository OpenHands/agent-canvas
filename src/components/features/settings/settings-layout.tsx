import { useState } from "react";
import { MobileHeader } from "./mobile-header";
import {
  SettingsDesktopSidebar,
  SettingsMobileDrawer,
} from "./settings-navigation";
import { SettingsNavRenderedItem } from "#/hooks/use-settings-nav-items";

interface SettingsLayoutProps {
  children: React.ReactNode;
  navigationItems: SettingsNavRenderedItem[];
}

/**
 * Mirrors the extensions layout (Skills / MCP): aside and main are siblings,
 * and only the main column scrolls so the left nav stays pinned like
 * ExtensionsNavigation.
 */
export function SettingsLayout({
  children,
  navigationItems,
}: SettingsLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex h-full flex-col px-[14px] md:px-0">
      <MobileHeader
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMenu={toggleMobileMenu}
      />
      <div className="flex min-h-0 flex-1 gap-10 md:items-start">
        <SettingsDesktopSidebar navigationItems={navigationItems} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto custom-scrollbar-always md:pr-[14px] md:pt-8 md:pb-12">
          <div className="mx-auto w-full min-w-0 max-w-[800px]">{children}</div>
        </main>
      </div>
      <SettingsMobileDrawer
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={closeMobileMenu}
        navigationItems={navigationItems}
      />
    </div>
  );
}
