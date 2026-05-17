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

const getMoreDetailedView = (
  currentView: SettingsView,
  nextView: SettingsView,
): SettingsView =>
  VIEW_ORDER[nextView] > VIEW_ORDER[currentView] ? nextView : currentView;

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

const PAYLOAD_DIFF_KEY: Record<SettingsValueSource, string> = {
  agent_settings: "agent_settings_diff",
  conversation_settings: "conversation_settings_diff",
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

export interface SettingsSourceConfig {
  /** Which schema/values bucket on `settings` this source pulls from. */
  settingsSource: SettingsValueSource;
  /** Section keys (e.g. ["llm"]) within that schema to render. */
  sectionKeys: string[];
  /** Field keys to skip (rendered elsewhere by the caller). */
  excludeKeys?: Set<string>;
}

export interface SdkSectionHeaderProps {
  values: SettingsFormValues;
  isDisabled: boolean;
  view: SettingsView;
  onChange: (key: string, value: string | boolean) => void;
}

interface ResolvedSource extends SettingsSourceConfig {
  filteredSchema: SettingsSchema | null;
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
 * A generic SDK-schema-driven settings page that renders fields from one or
 * more schema sections.
 *
 * The `settingsSources` array specifies which schema(s)/section(s) the page
 * owns. The page tracks values/dirty state per source, renders sections from
 * each source in order (filtered by the schema's `prominence` field for the
 * selected view), and emits a combined save payload like
 * `{ conversation_settings_diff: {...}, agent_settings_diff: {...} }` ---
 * including only the keys for sources that actually have dirty changes.
 *
 * @param settingsSources  one or more schemas to render fields from
 * @param header           render prop above the fields (receives unified state)
 * @param buildPayload     customize the save payload before submission
 * @param testId           data-testid on the page wrapper
 */
export function SdkSectionPage({
  settingsSources,
  scope = "personal",
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
  settingsSources: SettingsSourceConfig[];
  scope?: SettingsScope;

  header?: (props: SdkSectionHeaderProps) => React.ReactNode;
  extraDirty?: boolean;
  /**
   * Customize the save payload. Receives the wrapped default payload (e.g.
   * `{ agent_settings_diff: { llm: { model: "gpt-4" } } }`) plus the unified
   * form context. Return the payload to actually send.
   */
  buildPayload?: (
    defaultPayload: Record<string, unknown>,
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
  initialValueOverrides?: SettingsFormValues;
  embedded?: boolean;
  hideSaveButton?: boolean;
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
  const isReadOnly = false;

  const sourcesSignature = React.useMemo(
    () =>
      JSON.stringify(
        settingsSources.map((s) => ({
          source: s.settingsSource,
          sectionKeys: s.sectionKeys,
          excludeKeys: s.excludeKeys ? Array.from(s.excludeKeys).sort() : null,
        })),
      ),
    [settingsSources],
  );

  const resolvedSourceConfigs = React.useMemo<SettingsSourceConfig[]>(() => {
    const parsed = JSON.parse(sourcesSignature) as Array<{
      source: SettingsValueSource;
      sectionKeys: string[];
      excludeKeys: string[] | null;
    }>;
    return parsed.map((p) => ({
      settingsSource: p.source,
      sectionKeys: p.sectionKeys,
      excludeKeys: p.excludeKeys ? new Set(p.excludeKeys) : undefined,
    }));
  }, [sourcesSignature]);

  const getSchemaForSource = React.useCallback(
    (source: SettingsValueSource) =>
      source === "conversation_settings"
        ? conversationSchemaQuery.data
        : agentSchemaQuery.data,
    [agentSchemaQuery.data, conversationSchemaQuery.data],
  );

  const isSchemaLoading = resolvedSourceConfigs.some((src) =>
    src.settingsSource === "conversation_settings"
      ? conversationSchemaQuery.isLoading
      : agentSchemaQuery.isLoading,
  );

  const resolvedSources = React.useMemo<ResolvedSource[]>(
    () =>
      resolvedSourceConfigs.map((src) => {
        const schema = getSchemaForSource(src.settingsSource);
        if (!isValidSettingsSchema(schema)) {
          return { ...src, filteredSchema: null };
        }
        const sectionSet = new Set(src.sectionKeys);
        const filteredSchema: SettingsSchema = {
          ...schema,
          sections: schema.sections.filter((s) => sectionSet.has(s.key)),
        };
        return { ...src, filteredSchema };
      }),
    [resolvedSourceConfigs, getSchemaForSource],
  );

  const showAdvanced =
    forceShowAdvancedView ||
    resolvedSources.some((src) => hasAdvancedSettings(src.filteredSchema));
  const showAll =
    allowAllView &&
    resolvedSources.some((src) => hasMinorSettings(src.filteredSchema));

  const schemaUnavailableMessage = React.useMemo(() => {
    const firstError = resolvedSourceConfigs.reduce<unknown>(
      (err, src) =>
        err ??
        (src.settingsSource === "conversation_settings"
          ? conversationSchemaQuery.error
          : agentSchemaQuery.error),
      null,
    );
    return getSchemaUnavailableMessage(
      firstError,
      t(I18nKey.SETTINGS$SDK_SCHEMA_UNAVAILABLE),
    );
  }, [
    resolvedSourceConfigs,
    agentSchemaQuery.error,
    conversationSchemaQuery.error,
    t,
  ]);

  const overridesSignature = React.useMemo(
    () => (initialValueOverrides ? JSON.stringify(initialValueOverrides) : ""),
    [initialValueOverrides],
  );

  const [view, setView] = React.useState<SettingsView>("basic");
  const [valuesBySource, setValuesBySource] = React.useState<
    Partial<Record<SettingsValueSource, SettingsFormValues>>
  >({});
  const [dirtyBySource, setDirtyBySource] = React.useState<
    Partial<Record<SettingsValueSource, SettingsDirtyState>>
  >({});
  const hasHydratedViewRef = React.useRef(false);

  const initialValuesBySource = React.useMemo<Partial<
    Record<SettingsValueSource, SettingsFormValues>
  > | null>(() => {
    if (!settings) return null;
    const result: Partial<Record<SettingsValueSource, SettingsFormValues>> = {};
    for (const src of resolvedSources) {
      if (!src.filteredSchema) return null;
      result[src.settingsSource] = {
        ...(result[src.settingsSource] ?? {}),
        ...buildInitialSettingsFormValues(
          settings,
          src.filteredSchema,
          src.settingsSource,
        ),
      };
    }
    if (initialValueOverrides) {
      const firstSource = resolvedSources[0]?.settingsSource;
      if (firstSource && result[firstSource]) {
        result[firstSource] = {
          ...result[firstSource],
          ...initialValueOverrides,
        };
      }
    }
    return result;
  }, [settings, resolvedSources, overridesSignature]);

  const initialView = React.useMemo(() => {
    if (!settings) return null;
    let result: SettingsView | null = null;
    for (const src of resolvedSources) {
      if (!src.filteredSchema) return null;
      const perSource = getInitialView
        ? getInitialView(settings, src.filteredSchema)
        : inferInitialView(settings, src.filteredSchema, src.settingsSource);
      result = result ? getMoreDetailedView(result, perSource) : perSource;
    }
    if (!result) return null;
    return normalizeView(result, { showAdvanced, showAll });
  }, [settings, resolvedSources, getInitialView, showAdvanced, showAll]);

  React.useEffect(() => {
    hasHydratedViewRef.current = false;
    setView("basic");
    setValuesBySource({});
    setDirtyBySource({});
  }, [scope, sourcesSignature]);

  React.useEffect(() => {
    if (!initialValuesBySource || !initialView) return;

    setValuesBySource(initialValuesBySource);
    if (initialValueOverrides) {
      const firstSource = resolvedSources[0]?.settingsSource;
      if (firstSource) {
        const overrideDirty: SettingsDirtyState = Object.fromEntries(
          Object.keys(initialValueOverrides).map((key) => [key, true]),
        );
        setDirtyBySource({ [firstSource]: overrideDirty });
      } else {
        setDirtyBySource({});
      }
    } else {
      setDirtyBySource({});
    }
    setView((currentView) => {
      if (!hasHydratedViewRef.current) {
        hasHydratedViewRef.current = true;
        return initialView;
      }

      return getLessDetailedView(currentView, initialView);
    });
  }, [initialValuesBySource, initialView]);

  const fieldKeyToSource = React.useMemo(() => {
    const map = new Map<string, SettingsValueSource>();
    for (const src of resolvedSources) {
      if (src.filteredSchema) {
        for (const section of src.filteredSchema.sections) {
          for (const field of section.fields) {
            if (!map.has(field.key)) {
              map.set(field.key, src.settingsSource);
            }
          }
        }
      }
    }
    return map;
  }, [resolvedSources]);

  const flatValues = React.useMemo<SettingsFormValues>(() => {
    const merged: SettingsFormValues = {};
    for (const src of resolvedSources) {
      Object.assign(merged, valuesBySource[src.settingsSource] ?? {});
    }
    return merged;
  }, [resolvedSources, valuesBySource]);

  const flatDirty = React.useMemo<SettingsDirtyState>(() => {
    const merged: SettingsDirtyState = {};
    for (const src of resolvedSources) {
      Object.assign(merged, dirtyBySource[src.settingsSource] ?? {});
    }
    return merged;
  }, [resolvedSources, dirtyBySource]);

  const handleFieldChange = React.useCallback(
    (fieldKey: string, nextValue: string | boolean) => {
      const sourceKey = fieldKeyToSource.get(fieldKey);
      if (!sourceKey) return;
      setValuesBySource((prev) => ({
        ...prev,
        [sourceKey]: {
          ...(prev[sourceKey] ?? {}),
          [fieldKey]: nextValue,
        },
      }));
      setDirtyBySource((prev) => ({
        ...prev,
        [sourceKey]: {
          ...(prev[sourceKey] ?? {}),
          [fieldKey]: true,
        },
      }));
    },
    [fieldKeyToSource],
  );

  const handleError = React.useCallback(
    (error: AxiosError) => {
      const msg = retrieveAxiosErrorMessage(error);
      displayErrorToast(msg || t(I18nKey.ERROR$GENERIC));
    },
    [t],
  );

  const handleSaveRef = React.useRef<() => void>(() => {});
  const stableSave = React.useCallback(() => {
    handleSaveRef.current();
  }, []);

  const handleSave = () => {
    if (isReadOnly) return;
    if (resolvedSources.some((src) => !src.filteredSchema)) return;

    let payload: Record<string, unknown>;
    try {
      const defaultPayload: Record<string, unknown> = {};
      for (const src of resolvedSources) {
        const schema = src.filteredSchema!;
        const sourceValues = valuesBySource[src.settingsSource] ?? {};
        const sourceDirty = dirtyBySource[src.settingsSource] ?? {};
        const diff = buildSdkSettingsPayloadForView(
          schema,
          sourceValues,
          sourceDirty,
          view,
        );
        if (Object.keys(diff).length > 0) {
          const diffKey = PAYLOAD_DIFF_KEY[src.settingsSource];
          defaultPayload[diffKey] = {
            ...((defaultPayload[diffKey] as
              | Record<string, unknown>
              | undefined) ?? {}),
            ...diff,
          };
        }
      }

      payload = buildPayload
        ? buildPayload(defaultPayload, {
            values: flatValues,
            dirty: flatDirty,
            view,
          })
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
        setDirtyBySource({});
        onSaveSuccess?.();
      },
    });
  };

  handleSaveRef.current = handleSave;

  const isDirty = Object.keys(flatDirty).length > 0;
  const saveControlIsDirty = isDirty || extraDirty;
  React.useEffect(() => {
    if (!onSaveControlChange) return;
    onSaveControlChange({
      save: stableSave,
      isSaving: isPending,
      isDirty: saveControlIsDirty,
      values: flatValues,
    });
  }, [isPending, saveControlIsDirty, flatValues]);

  if (isLoading || isFetching || isSchemaLoading) {
    return <LlmSettingsInputsSkeleton />;
  }

  const hasAnyVisibleSection = resolvedSources.some(
    (src) => src.filteredSchema && src.filteredSchema.sections.length > 0,
  );

  if (!hasAnyVisibleSection) {
    return (
      <Typography.Paragraph className="text-tertiary-alt">
        {schemaUnavailableMessage}
      </Typography.Paragraph>
    );
  }

  if (Object.keys(flatValues).length === 0) {
    return <LlmSettingsInputsSkeleton />;
  }

  // Scrolling is owned by the settings shell (or onboarding wrapper), not a
  // nested scroll region. Save actions are inline after the last field.
  const bodyClassName = "flex flex-col gap-8";

  return (
    <div
      data-testid={testId}
      className={
        embedded
          ? "relative flex min-h-0 w-full flex-1 flex-col"
          : "relative w-full min-h-0"
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
          values: flatValues,
          isDisabled: isReadOnly,
          view,
          onChange: handleFieldChange,
        })}

        {resolvedSources.map((src) => {
          if (!src.filteredSchema) return null;
          const sourceValues = valuesBySource[src.settingsSource] ?? {};
          const visibleSections = getVisibleSettingsSections(
            src.filteredSchema,
            { ...flatValues, ...sourceValues },
            view,
            src.excludeKeys ?? EMPTY_EXCLUDE_KEYS,
          );
          return visibleSections.map((section) => (
            <section
              key={`${src.settingsSource}:${section.key}`}
              className="flex flex-col gap-4"
            >
              <div className="grid gap-4 xl:grid-cols-2">
                {section.fields.map((field) => (
                  <SchemaField
                    key={field.key}
                    field={field}
                    value={sourceValues[field.key]}
                    isDisabled={isReadOnly}
                    onChange={(nextValue) =>
                      handleFieldChange(field.key, nextValue)
                    }
                  />
                ))}
              </div>
            </section>
          ));
        })}

        {!isReadOnly && !hideSaveButton ? (
          <div className="flex justify-start pt-2">
            <BrandButton
              testId="save-button"
              type="button"
              variant="primary"
              isDisabled={isPending || (!isDirty && !extraDirty)}
              onClick={handleSave}
            >
              {isPending
                ? t(I18nKey.SETTINGS$SAVING)
                : t(I18nKey.SETTINGS$SAVE_CHANGES)}
            </BrandButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
