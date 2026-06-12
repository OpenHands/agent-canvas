import React from "react";
import { useTranslation } from "react-i18next";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { I18nKey } from "#/i18n/declaration";
import { modalTitleLgClassName } from "#/utils/modal-classes";
import type { RecommendedAutomation } from "@openhands/extensions/automations";
import {
  type AutomationConfig,
  getInitialConfigValues,
} from "./automation-config";

interface AutomationConfigModalProps {
  automation: RecommendedAutomation;
  config: AutomationConfig;
  onClose: () => void;
  /** Receives the validated field values once the user confirms. */
  onSubmit: (values: Record<string, string>) => void;
}

/**
 * Issue #950 step 4: after MCP setup, collect the structured configuration for
 * a pre-built automation (e.g. target repo, review style, respond-to label)
 * before launching. The launcher turns these values into a deterministic
 * prompt via {@link AutomationConfig.buildPrompt}.
 */
export function AutomationConfigModal({
  automation,
  config,
  onClose,
  onSubmit,
}: AutomationConfigModalProps) {
  const { t } = useTranslation("openhands");
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    getInitialConfigValues(config),
  );
  const [errors, setErrors] = React.useState<Record<string, string | null>>({});

  const setValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: null }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: Record<string, string | null> = {};
    for (const field of config.fields) {
      if (field.required && !(values[field.key] ?? "").trim()) {
        nextErrors[field.key] = t(I18nKey.MCP$ERROR_FIELD_REQUIRED);
      }
    }
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      return;
    }

    onSubmit(values);
  };

  return (
    <ModalBackdrop onClose={onClose} aria-label={automation.name}>
      <form
        data-testid="automation-config-modal"
        data-automation-id={automation.id}
        onSubmit={handleSubmit}
        className="relative bg-base-secondary p-6 rounded-xl flex flex-col gap-4 border border-[var(--oh-border)] w-[520px] max-w-[90vw] max-h-[85vh] overflow-y-auto custom-scrollbar"
      >
        <ModalCloseButton
          onClose={onClose}
          testId="automation-config-modal-close"
        />
        <div className="flex flex-col gap-1 pr-6">
          <h2 className={modalTitleLgClassName}>{t(config.titleKey)}</h2>
          <p className="text-xs text-tertiary-light">
            {t(config.descriptionKey)}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {config.fields.map((field) => {
            const fieldError = errors[field.key];
            const helperText = field.helperTextKey
              ? t(field.helperTextKey)
              : null;

            if (field.type === "select") {
              const items = (field.options ?? []).map((option) => ({
                key: option.value,
                label: t(option.labelKey),
              }));
              return (
                <div key={field.key} className="flex flex-col gap-1">
                  <SettingsDropdownInput
                    testId={`automation-config-field-${field.key}`}
                    name={field.key}
                    label={t(field.labelKey)}
                    items={items}
                    selectedKey={values[field.key] || undefined}
                    defaultSelectedKey={field.defaultValue}
                    onSelectionChange={(key) =>
                      setValue(field.key, key ? String(key) : "")
                    }
                    required={field.required}
                  />
                  {helperText && (
                    <p className="text-xs text-tertiary-alt">{helperText}</p>
                  )}
                  {fieldError && (
                    <p className="text-xs text-red-500">{fieldError}</p>
                  )}
                </div>
              );
            }

            return (
              <div key={field.key} className="flex flex-col gap-1">
                <SettingsInput
                  testId={`automation-config-field-${field.key}`}
                  name={field.key}
                  type="text"
                  label={t(field.labelKey)}
                  value={values[field.key] ?? ""}
                  onChange={(value) => setValue(field.key, value)}
                  placeholder={
                    field.placeholderKey ? t(field.placeholderKey) : undefined
                  }
                  required={field.required}
                  showOptionalTag={!field.required}
                  className="w-full"
                />
                {helperText && (
                  <p className="text-xs text-tertiary-alt">{helperText}</p>
                )}
                {fieldError && (
                  <p className="text-xs text-red-500">{fieldError}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <BrandButton
            type="button"
            variant="secondary"
            onClick={onClose}
            testId="automation-config-cancel"
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
          <BrandButton
            type="submit"
            variant="primary"
            testId="automation-config-submit"
          >
            {t(I18nKey.AUTOMATION_CONFIG$CREATE_BUTTON)}
          </BrandButton>
        </div>
      </form>
    </ModalBackdrop>
  );
}
