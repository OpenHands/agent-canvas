import React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { LlmSettingsInputsSkeleton } from "#/components/features/settings/llm-settings/llm-settings-inputs-skeleton";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import {
  useAgentSettingsSchema,
  useConversationSettingsSchema,
} from "#/hooks/query/use-agent-settings-schema";
import { useSettings } from "#/hooks/query/use-settings";
import { I18nKey } from "#/i18n/declaration";
import { Typography } from "#/ui/typography";
import { Settings, SettingsSchema, SettingsScope } from "#/types/settings";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import {
  buildInitialSettingsFormValues,
  buildSdkSettingsPayloadForView,
  getVisibleSettingsSections,
  hasAdvancedSettings,
  hasMinorSettings,
  inferInitialView,
  isValidSettingsSchema,
  SettingsDirtyState,
  SettingsFormValues,
  type SettingsValueSource,
  type SettingsView,
} from "#/utils/sdk-settings-schema";
import { SchemaField } from "./schema-field";
import { ViewToggle } from "./view-toggle";

const EMPTY_EXCLUDE_KEYS = new Set<string>();

const VIEW_ORDER: Record<SettingsView, number> = {
  basic: 0,
  advanced: 1,
  all: 2,
};

const getLessDetailedView = (
  currentView: SettingsView,
  nextView: SettingsView,
): SettingsView =>
  VIEW_ORDER[nextView] < VIEW_ORDER[currentView] ? nextView : currentView;

const normalizeView = (
  view: SettingsView,
  {
    showAdvanced,
    showAll,
  }: {
    showAdvanced: boolean;
    showAll: boolean;
  },
): SettingsView => {
  if (view === "all") {
    if (showAll) {
      return "all";
    }

    return showAdvanced ? "advanced" : "basic";
  }

  if (view === "advanced") {
    if (showAdvanced) {
      return "advanced";
    }

    return showAll ? "all" : "basic";
  }

  return "basic";
};

const getSchemaUnavailableMessage = (
  error: unknown,
  fallbackMessage: string,
): string => {
  if (!(error instanceof AxiosError)) {
    return fallbackMessage;
  }

  if (error.response?.status === 401) {
    return `${fallbackMessage} This agent server requires X-Session-API-Key. Set VITE_SESSION_API_KEY in the frontend to the same value used by the backend SESSION_API_KEY or OH_SESSION_API_KEYS_0.`;
  }

  if (error.response?.status === 404) {
    return `${fallbackMessage} This backend does not expose /api/settings/* schema endpoints. Upgrade to a recent openhands-agent-server release.`;
  }

  return fallbackMessage;
};

export interface SdkSectionHeaderProps {
  values: SettingsFormValues;
  isDisabled: boolean;
  view: SettingsView;
  onChange: (key: string, value: string | boolean) => void;
}

/**
 * Snapshot of the page's save state, surfaced to the parent so it can
 * render its own Save/Next button (e.g. in onboarding) when
 * {@link SdkSectionPage}'s built-in button is hidden via
 * `hideSaveButton`.
 */
export interface SdkSectionSaveControl {
  /** Trigger a save of the currently-dirty fields. No-op while `isSaving` or `!isDirty`. */
  save: () => void;
  /** A save mutation is in flight. */
  isSaving: boolean;
  /** At least one field is dirty (or `extraDirty` was passed in). */
  isDirty: boolean;
  /** Current form values (for custom save flows). */
  values: SettingsFormValues;
}

/**
 * A generic SDK-schema–driven settings page that renders fields
 * from one or more schema sections.
 *
 * @param sectionKeys - which schema section(s) this page owns (e.g. ["condenser"])
 * @param excludeKeys - field keys to skip (rendered elsewhere by the caller)
 * @param header      - optional render prop receiving shared state to render above fields
 * @param testId      - data-testid for the page wrapper
 */
export function SdkSectionPage({
  sectionKeys,
  excludeKeys = EMPTY_EXCLUDE_KEYS,
  scope = "personal",
  settingsSource = "agent_settings",
  header,
  extraDirty = false,
  buildPayload,
  onSaveSuccess,
  getInitialView,
  forceShowAdvancedView = false,
  allowAllView = true,
  initialValueOverrides,
  embedded = false,
  hideSaveButton = false,
  onSaveControlChange,
  testId = "sdk-section-settings-screen",
}: {
  sectionKeys: string[];
  excludeKeys?: Set<string>;
  scope?: SettingsScope;
  settingsSource?: SettingsValueSource;

  header?: (props: SdkSectionHeaderProps) => React.ReactNode;
  extraDirty?: boolean;
  buildPayload?: (
    payload: ReturnType<typeof buildSdkSettingsPayloadForView>,
    context: {
      values: SettingsFormValues;
      dirty: SettingsDirtyState;
      view: SettingsView;
    },
  ) => Record<string, unknown>;
  onSaveSuccess?: () => void;
  getInitialView?: (
    settings: Settings,
    filteredSchema: SettingsSchema,
  ) => SettingsView;
  forceShowAdvancedView?: boolean;
  allowAllView?: boolean;
  /**
   * Per-field initial value overrides that win over the values
   * derived from `useSettings`. The keys of each override are also
   * marked dirty on hydration so the user can save the form without
   * having to touch the prefilled fields. Useful when the page is
   * embedded in a flow that wants to nudge brand-new users toward a
   * particular default (e.g. onboarding pre-filling Anthropic/Opus).
   */
  initialValueOverrides?: SettingsFormValues;
  /**
   * When true, the Save button container is rendered inline (no
   * sticky positioning, no contrasting `bg-base` band) so the page
   * can be dropped into a modal/card without a hard footer break.
   */
  embedded?: boolean;
  /**
   * Suppress the built-in Save Changes button entirely. Pair with
   * {@link onSaveControlChange} to drive saving from a parent-rendered
   * action (e.g. an onboarding "Next" button).
   */
  hideSaveButton?: boolean;
  /**
   * Fires whenever the save state changes (a mutation starts/finishes,
   * dirty status flips). Provides a stable `save()` callback the
   * parent can wire to its own button. Useful when the form is
   * embedded in a custom flow and the built-in Save button is hidden.
   */
  onSaveControlChange?: (control: SdkSectionSaveControl) => void;
  testId?: string;
}) {
  const { t } = useTranslation("openhands");
  const { mutate: saveSettings, isPending } = useSaveSettings(scope);
  const { data: settings, isLoading, isFetching } = useSettings(scope);
  const agentSchemaQuery = useAgentSettingsSchema(
    settings?.agent_settings_schema,
  );
  const conversationSchemaQuery = useConversationSettingsSchema(
    settings?.conversation_settings_schema,
  );
  const activeSchemaQuery =
    settingsSource === "conversation_settings"
      ? conversationSchemaQuery
      : agentSchemaQuery;
  const schema = activeSchemaQuery.data;
  const isSchemaLoading = activeSchemaQuery.isLoading;
  const isReadOnly = false;

  const [view, setView] = React.useState<SettingsView>("basic");
  const [values, setValues] = React.useState<SettingsFormValues>({});
  const [dirty, setDirty] = React.useState<SettingsDirtyState>({});
  const hasHydratedViewRef = React.useRef(false);

  const sectionKeysSignature = React.useMemo(
    () => JSON.stringify(sectionKeys),
    [sectionKeys],
  );
  const stableSectionKeys = React.useMemo(
    () => JSON.parse(sectionKeysSignature) as string[],
    [sectionKeysSignature],
  );

  // Build a filtered schema containing only the requested sections.
  // `isValidSettingsSchema` guards against truthy-but-malformed schema
  // responses (e.g. when the deployment is pointed at a host that does
  // not serve `/api/settings/agent-schema` and returns an SPA shell
  // that parses into an object without a `sections` array). Without
  // the guard, `schema.sections.filter(...)` would throw and React
  // Router would escalate the crash to a full-screen error.
  const filteredSchema = React.useMemo(() => {
    if (!isValidSettingsSchema(schema)) return null;
    const sectionSet = new Set(stableSectionKeys);
    return {
      ...schema,
      sections: schema.sections.filter((s) => sectionSet.has(s.key)),
    };
  }, [schema, stableSectionKeys]);

  const showAdvanced =
    forceShowAdvancedView || hasAdvancedSettings(filteredSchema);
  const showAll = allowAllView && hasMinorSettings(filteredSchema);
  const schemaUnavailableMessage = React.useMemo(
    () =>
      getSchemaUnavailableMessage(
        activeSchemaQuery.error,
        t(I18nKey.SETTINGS$SDK_SCHEMA_UNAVAILABLE),
      ),
    [activeSchemaQuery.error, t],
  );

  const overridesSignature = React.useMemo(
    () => (initialValueOverrides ? JSON.stringify(initialValueOverrides) : ""),
    [initialValueOverrides],
  );

  const initialValues = React.useMemo(() => {
    if (!settings || !filteredSchema) return null;
    const base = buildInitialSettingsFormValues(
      settings,
      filteredSchema,
      settingsSource,
    );
    if (!initialValueOverrides) return base;
    return { ...base, ...initialValueOverrides };
    // overridesSignature keeps the memo reactive without depending on
    // a (potentially recreated) object reference each render.
  }, [settings, filteredSchema, settingsSource, overridesSignature]);

  const initialView = React.useMemo(() => {
    if (!settings || !filteredSchema) return null;

    const resolvedInitialView = getInitialView
      ? getInitialView(settings, filteredSchema)
      : inferInitialView(settings, filteredSchema, settingsSource);

    return normalizeView(resolvedInitialView, { showAdvanced, showAll });
  }, [
    settings,
    filteredSchema,
    getInitialView,
    settingsSource,
    showAdvanced,
    showAll,
  ]);

  React.useEffect(() => {
    hasHydratedViewRef.current = false;
    setView("basic");
    setValues({});
    setDirty({});
  }, [scope, settingsSource, sectionKeysSignature]);

  React.useEffect(() => {
    if (!initialValues || !initialView) return;

    setValues(initialValues);
    // Override-supplied keys are pre-populated for the user, so mark
    // them dirty up-front; otherwise the Save button stays disabled
    // until the user touches a field, defeating the point of the
    // override.
    const overrideDirty: SettingsDirtyState = initialValueOverrides
      ? Object.fromEntries(
          Object.keys(initialValueOverrides).map((key) => [key, true]),
        )
      : {};
    setDirty(overrideDirty);
    setView((currentView) => {
      if (!hasHydratedViewRef.current) {
        hasHydratedViewRef.current = true;
        return initialView;
      }

      return getLessDetailedView(currentView, initialView);
    });
    // initialValueOverrides is intentionally tracked via
    // overridesSignature on initialValues; including the object ref
    // here would re-fire the effect every render.
  }, [initialValues, initialView]);

  const visibleSections = React.useMemo(() => {
    if (!filteredSchema) return [];
    return getVisibleSettingsSections(
      filteredSchema,
      values,
      view,
      excludeKeys,
    );
  }, [filteredSchema, values, view, excludeKeys]);

  const handleFieldChange = React.useCallback(
    (fieldKey: string, nextValue: string | boolean) => {
      setValues((prev) => ({ ...prev, [fieldKey]: nextValue }));
      setDirty((prev) => ({ ...prev, [fieldKey]: true }));
    },
    [],
  );

  const handleError = React.useCallback(
    (error: AxiosError) => {
      const msg = retrieveAxiosErrorMessage(error);
      displayErrorToast(msg || t(I18nKey.ERROR$GENERIC));
    },
    [t],
  );

  // Stable save callback so `onSaveControlChange` can hand a single
  // function reference to the parent across renders. The latest
  // closure is kept up to date via `handleSaveRef`.
  const handleSaveRef = React.useRef<() => void>(() => {});
  const stableSave = React.useCallback(() => {
    handleSaveRef.current();
  }, []);

  const handleSave = () => {
    if (!filteredSchema || isReadOnly) return;

    let payload: Record<string, unknown>;
    try {
      const basePayload = buildSdkSettingsPayloadForView(
        filteredSchema,
        values,
        dirty,
        view,
      );
      let defaultPayload: Record<string, unknown>;
      if (settingsSource === "conversation_settings") {
        defaultPayload = { conversation_settings_diff: basePayload };
      } else {
        defaultPayload = { agent_settings_diff: basePayload };
      }
      payload = buildPayload
        ? buildPayload(basePayload, { values, dirty, view })
        : defaultPayload;
    } catch (error) {
      displayErrorToast(
        error instanceof Error ? error.message : t(I18nKey.ERROR$GENERIC),
      );
      return;
    }

    if (Object.keys(payload).length === 0) return;

    saveSettings(payload, {
      onError: handleError,
      onSuccess: () => {
        displaySuccessToast(t(I18nKey.SETTINGS$SAVED_WARNING));
        setDirty({});
        onSaveSuccess?.();
      },
    });
  };

  handleSaveRef.current = handleSave;

  // Surface save state to the parent. Hooks must run before any
  // conditional early-returns below, so this lives here rather than
  // alongside the JSX. The dependency list deliberately excludes
  // `stableSave` (it never changes) and `onSaveControlChange` (we
  // tolerate ref-instability of the callback to avoid spamming the
  // parent on every render).
  const saveControlIsDirty = Object.keys(dirty).length > 0 || extraDirty;
  React.useEffect(() => {
    if (!onSaveControlChange) return;
    onSaveControlChange({
      save: stableSave,
      isSaving: isPending,
      isDirty: saveControlIsDirty,
      values,
    });
  }, [isPending, saveControlIsDirty, values]);

  if (isLoading || isFetching || isSchemaLoading) {
    return <LlmSettingsInputsSkeleton />;
  }

  if (!filteredSchema || filteredSchema.sections.length === 0) {
    return (
      <Typography.Paragraph className="text-tertiary-alt">
        {schemaUnavailableMessage}
      </Typography.Paragraph>
    );
  }

  if (Object.keys(values).length === 0) return <LlmSettingsInputsSkeleton />;

  // In embedded mode the form body owns scrolling so the surrounding
  // chrome (heading, tabs, footer) stays pinned. Otherwise we keep the
  // historical block layout, reserving `pb-20` for the sticky Save bar
  // when it is rendered.
  let bodyClassName: string;
  if (embedded) {
    bodyClassName =
      "flex-1 min-h-0 overflow-y-auto custom-scrollbar-always flex flex-col gap-8";
  } else if (hideSaveButton) {
    bodyClassName = "flex flex-col gap-8";
  } else {
    bodyClassName = "flex flex-col gap-8 pb-20";
  }

  return (
    <div
      data-testid={testId}
      className={
        embedded ? "relative flex-1 min-h-0 flex flex-col" : "h-full relative"
      }
    >
      <ViewToggle
        view={view}
        setView={setView}
        showAdvanced={showAdvanced}
        showAll={showAll}
        isDisabled={isReadOnly}
      />

      <div className={bodyClassName}>
        {header?.({
          values,
          isDisabled: isReadOnly,
          view,
          onChange: handleFieldChange,
        })}

        {visibleSections.map((section, sectionIndex) => (
          <section
            key={`${section.key}-${sectionIndex}`}
            className="flex flex-col gap-4"
          >
            <div className="grid gap-4 xl:grid-cols-2">
              {section.fields.map((field) => (
                <SchemaField
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  isDisabled={isReadOnly}
                  onChange={(nextValue) =>
                    handleFieldChange(field.key, nextValue)
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {!isReadOnly && !hideSaveButton ? (
        <div className={embedded ? "pt-2" : "sticky bottom-0 bg-base py-4"}>
          <BrandButton
            testId="save-button"
            type="button"
            variant="primary"
            isDisabled={
              isPending || (Object.keys(dirty).length === 0 && !extraDirty)
            }
            onClick={handleSave}
          >
            {isPending
              ? t(I18nKey.SETTINGS$SAVING)
              : t(I18nKey.SETTINGS$SAVE_CHANGES)}
          </BrandButton>
        </div>
      ) : null}
    </div>
  );
}
