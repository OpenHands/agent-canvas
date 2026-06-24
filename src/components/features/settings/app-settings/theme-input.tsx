import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { SettingsDropdownInput } from "../settings-dropdown-input";
import {
  AVAILABLE_COLOR_THEMES,
  type ColorThemeKey,
  applyActiveTheme,
  persistColorTheme,
  readPersistedColorTheme,
} from "#/themes/color-themes";
import {
  AVAILABLE_APPEARANCE_MODES,
  type AppearanceMode,
  persistAppearanceMode,
  readPersistedAppearanceMode,
} from "#/themes/appearance";

export function ThemeInput() {
  const { t } = useTranslation("openhands");

  const handleThemeChange = React.useCallback((key: React.Key | null) => {
    if (!key) return;
    persistColorTheme(key as ColorThemeKey);
    applyActiveTheme();
  }, []);

  const handleAppearanceChange = React.useCallback((key: React.Key | null) => {
    if (!key) return;
    persistAppearanceMode(key as AppearanceMode);
    applyActiveTheme();
  }, []);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <SettingsDropdownInput
        testId="color-theme-input"
        name="color-theme-input"
        label={t(I18nKey.SETTINGS$COLOR_THEME)}
        items={AVAILABLE_COLOR_THEMES.map((theme) => ({
          key: theme.key,
          label: theme.label,
        }))}
        defaultSelectedKey={readPersistedColorTheme()}
        onSelectionChange={handleThemeChange}
        isClearable={false}
        wrapperClassName="w-full min-w-0"
      />
      <SettingsDropdownInput
        testId="appearance-mode-input"
        name="appearance-mode-input"
        label={t(I18nKey.SETTINGS$APPEARANCE)}
        items={AVAILABLE_APPEARANCE_MODES.map((mode) => ({
          key: mode.key,
          label: mode.label,
        }))}
        defaultSelectedKey={readPersistedAppearanceMode()}
        onSelectionChange={handleAppearanceChange}
        isClearable={false}
        wrapperClassName="w-full min-w-0"
      />
    </div>
  );
}
