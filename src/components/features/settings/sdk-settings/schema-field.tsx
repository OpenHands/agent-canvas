import React from "react";
import { useTranslation } from "react-i18next";
import { OptionalTag } from "#/components/features/settings/optional-tag";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { SettingsFieldSchema } from "#/types/settings";
import { HelpLink } from "#/ui/help-link";
import { Typography } from "#/ui/typography";
import {
  getSettingsFieldConstraints,
  resolveSchemaChoiceLabel,
  resolveSchemaFieldDescription,
  resolveSchemaFieldLabel,
} from "#/utils/sdk-settings-field-metadata";
import { cn } from "#/utils/utils";
import {
  formControlMultilineFieldClassName,
  formControlSwitchDescriptionClassName,
} from "#/utils/form-control-classes";

// ---------------------------------------------------------------------------
// Help links – UI-only mapping from field keys to user-facing guidance.
// Keys use conventional i18n pattern: SCHEMA$<PATH>$HELP_TEXT / HELP_LINK_TEXT
// ---------------------------------------------------------------------------
export const FIELD_HELP_LINKS: Record<
  string,
  {
    textKey: string;
    linkTextKey: string;
    href: string;
    /** Skip rendering the schema description separately when the help text already includes it. */
    hideDescription?: boolean;
    /** Optional trailing copy rendered after the link (e.g. " tab of OpenHands Cloud."). */
    suffixKey?: string;
  }
> = {
  "llm.api_key": {
    textKey: "SCHEMA$LLM$API_KEY$HELP_TEXT",
    linkTextKey: "SCHEMA$LLM$API_KEY$HELP_LINK_TEXT",
    href: "https://docs.openhands.dev/usage/local-setup#getting-an-api-key",
  },
  // Mirror the hint shown under the LLM provider's API key field when
  // OpenHands is selected as the active provider; the SDK reuses that active
  // LLM key when the critic key is empty.
  "verification.critic_api_key": {
    textKey: "SCHEMA$VERIFICATION$CRITIC_API_KEY$HELP_TEXT",
    linkTextKey: "SETTINGS$NAV_API_KEYS",
    suffixKey: "SCHEMA$VERIFICATION$CRITIC_API_KEY$HELP_SUFFIX",
    href: "https://app.all-hands.dev/settings/api-keys",
    hideDescription: true,
  },
};

/**
 * Field keys that should span the full settings grid (both columns on xl
 * screens) instead of sharing a row with the next field. Used for inputs
 * whose label + value + help link need horizontal room so they don't
 * sit awkwardly opposite a single toggle.
 */
export const FIELD_FULL_WIDTH_KEYS: ReadonlySet<string> = new Set([
  "verification.critic_api_key",
]);

function FieldHelp({ field }: { field: SettingsFieldSchema }) {
  const { t } = useTranslation("openhands");
  const helpLink = FIELD_HELP_LINKS[field.key];
  const description = resolveSchemaFieldDescription(
    t,
    field.key,
    field.description,
  );

  return (
    <>
      {description && !helpLink?.hideDescription ? (
        <Typography.Paragraph className="text-tertiary-alt text-xs leading-5">
          {description}
        </Typography.Paragraph>
      ) : null}
      {helpLink ? (
        <HelpLink
          testId={`help-link-${field.key}`}
          text={t(helpLink.textKey)}
          linkText={t(helpLink.linkTextKey)}
          href={helpLink.href}
          suffix={helpLink.suffixKey ? ` ${t(helpLink.suffixKey)}` : undefined}
          size="settings"
          linkColor="white"
        />
      ) : null}
    </>
  );
}

function isSelectField(field: SettingsFieldSchema): boolean {
  return field.choices.length > 0;
}

function isBooleanField(field: SettingsFieldSchema): boolean {
  return field.value_type === "boolean" && !isSelectField(field);
}

function isJsonField(field: SettingsFieldSchema): boolean {
  return field.value_type === "array" || field.value_type === "object";
}

function isUrlField(field: SettingsFieldSchema): boolean {
  return field.key.endsWith("url") || field.key.endsWith("_url");
}

function getInputType(
  field: SettingsFieldSchema,
): React.HTMLInputTypeAttribute {
  if (field.secret) {
    return "password";
  }
  if (field.value_type === "integer" || field.value_type === "number") {
    return "number";
  }
  if (field.value_type === "string" && isUrlField(field)) {
    return "url";
  }
  return "text";
}

export function SchemaField({
  field,
  value,
  isDisabled,
  onChange,
}: {
  field: SettingsFieldSchema;
  value: string | boolean;
  isDisabled: boolean;
  onChange: (value: string | boolean) => void;
}) {
  const { t } = useTranslation("openhands");
  const label = resolveSchemaFieldLabel(t, field.key, field.label);
  const constraints = getSettingsFieldConstraints(field.key);

  if (isBooleanField(field)) {
    return (
      <div className="flex flex-col gap-1.5">
        <SettingsSwitch
          testId={`sdk-settings-${field.key}`}
          isToggled={Boolean(value)}
          isDisabled={isDisabled}
          onToggle={onChange}
        >
          {label}
        </SettingsSwitch>
        <div className={formControlSwitchDescriptionClassName}>
          <FieldHelp field={field} />
        </div>
      </div>
    );
  }

  if (isSelectField(field)) {
    return (
      <div className="flex flex-col gap-1.5">
        <SettingsDropdownInput
          testId={`sdk-settings-${field.key}`}
          name={field.key}
          label={label}
          items={field.choices.map((choice) => ({
            key: String(choice.value),
            label: resolveSchemaChoiceLabel(
              t,
              field.key,
              choice.value,
              choice.label,
            ),
          }))}
          selectedKey={value === "" ? undefined : String(value)}
          isClearable={!field.required}
          required={field.required}
          showOptionalTag={!field.required}
          isDisabled={isDisabled}
          onSelectionChange={(selectedKey) =>
            onChange(String(selectedKey ?? ""))
          }
        />
        <FieldHelp field={field} />
      </div>
    );
  }

  if (isJsonField(field)) {
    return (
      <label className="flex flex-col gap-2.5 w-full">
        <div className="flex items-center gap-2">
          <span className="text-sm">{label}</span>
          {!field.required ? <OptionalTag /> : null}
        </div>
        <textarea
          data-testid={`sdk-settings-${field.key}`}
          name={field.key}
          value={String(value ?? "")}
          required={field.required}
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            formControlMultilineFieldClassName,
            "min-h-32 font-mono placeholder:italic",
            "disabled:bg-[var(--oh-surface-raised)] disabled:border-[var(--oh-border-subtle)]",
          )}
        />
        <FieldHelp field={field} />
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <SettingsInput
        testId={`sdk-settings-${field.key}`}
        name={field.key}
        label={label}
        type={getInputType(field)}
        value={String(value ?? "")}
        required={field.required}
        showOptionalTag={!field.required}
        isDisabled={isDisabled}
        onChange={onChange}
        className="w-full"
        min={constraints?.min}
        max={constraints?.max}
        step={constraints?.step}
      />
      <FieldHelp field={field} />
    </div>
  );
}
