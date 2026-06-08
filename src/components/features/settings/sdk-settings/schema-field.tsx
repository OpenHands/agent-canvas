import React from "react";
import { useTranslation } from "react-i18next";
import { OptionalTag } from "#/components/features/settings/optional-tag";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { I18nKey } from "#/i18n/declaration";
import { SettingsFieldSchema } from "#/types/settings";
import { HelpLink } from "#/ui/help-link";
import { Typography } from "#/ui/typography";
import {
  getSettingsFieldConstraints,
  resolveSchemaChoiceLabel,
  resolveSchemaFieldDescription,
  resolveSchemaFieldLabel,
  type SettingsFieldConstraints,
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
  { textKey: string; linkTextKey: string; href: string }
> = {
  "llm.api_key": {
    textKey: "SCHEMA$LLM$API_KEY$HELP_TEXT",
    linkTextKey: "SCHEMA$LLM$API_KEY$HELP_LINK_TEXT",
    href: "https://docs.openhands.dev/usage/local-setup#getting-an-api-key",
  },
};

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
      {description ? (
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

function isNumericField(field: SettingsFieldSchema): boolean {
  return field.value_type === "integer" || field.value_type === "number";
}

/**
 * Live validation message for numeric inputs: returns an I18nKey (with optional
 * interpolation values) for the field's value, or null when it is valid/empty.
 * Mirrors the native min/step constraints so users get immediate red feedback
 * instead of an unclear error only when they try to save.
 *
 * `hasBadInput` reflects the native `<input type="number">` bad-input state:
 * browsers report unparseable entries (e.g. typed letters) as an empty value,
 * so this flag is the only signal that the user typed something non-numeric.
 */
export function getNumericFieldError(
  field: SettingsFieldSchema,
  value: string | boolean,
  constraints: SettingsFieldConstraints | undefined,
  hasBadInput = false,
): { key: I18nKey; options?: Record<string, unknown> } | null {
  if (!isNumericField(field) || typeof value !== "string") {
    return null;
  }
  if (field.value_type === "integer" && hasBadInput) {
    return { key: I18nKey.SCHEMA$ERROR$WHOLE_NUMBER };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  if (field.value_type === "integer" && !Number.isInteger(parsed)) {
    return { key: I18nKey.SCHEMA$ERROR$WHOLE_NUMBER };
  }
  if (constraints?.min !== undefined && parsed < constraints.min) {
    return {
      key: I18nKey.SCHEMA$ERROR$MIN_VALUE,
      options: { min: constraints.min },
    };
  }
  return null;
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
  const numericInputRef = React.useRef<HTMLInputElement>(null);
  const [hasBadNumericInput, setHasBadNumericInput] = React.useState(false);
  const label = resolveSchemaFieldLabel(t, field.key, field.label);
  const constraints = getSettingsFieldConstraints(field.key);
  const numeric = isNumericField(field);
  const numericError = getNumericFieldError(
    field,
    value,
    constraints,
    hasBadNumericInput,
  );

  // Track the native bad-input state of number inputs. We listen to the raw
  // `input` event rather than React's `onChange` because React skips onChange
  // when `node.value` is unchanged — and a number input reports an empty value
  // for unparseable entries (e.g. a typed letter), so onChange never fires when
  // a letter is typed into an empty field.
  React.useEffect(() => {
    const input = numericInputRef.current;
    if (!numeric || !input) {
      return undefined;
    }
    const syncBadInput = () => setHasBadNumericInput(input.validity.badInput);
    input.addEventListener("input", syncBadInput);
    return () => input.removeEventListener("input", syncBadInput);
  }, [numeric]);

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
        ref={numeric ? numericInputRef : undefined}
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
        error={
          numericError ? t(numericError.key, numericError.options) : undefined
        }
      />
      <FieldHelp field={field} />
    </div>
  );
}
