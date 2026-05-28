import React from "react";
import { useTranslation } from "react-i18next";
import { ModelSelector } from "#/components/shared/modals/settings/model-selector";
import { useAgentSettingsSchema } from "#/hooks/query/use-agent-settings-schema";
import { useSettings } from "#/hooks/query/use-settings";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { OpenAISubscriptionAuthCard } from "#/components/features/settings/llm-settings/openai-subscription-auth-card";
import { HelpLink } from "#/ui/help-link";
import { KeyStatusIcon } from "#/components/features/settings/key-status-icon";
import {
  SdkSectionHeaderProps,
  SdkSectionPage,
  SdkSectionSaveControl,
} from "#/components/features/settings/sdk-settings/sdk-section-page";
import { LlmSettingsLocalView } from "#/components/features/settings/llm-profiles";
import { I18nKey } from "#/i18n/declaration";
import { Settings, SettingsSchema, SettingsScope } from "#/types/settings";
import { extractModelAndProvider } from "#/utils/extract-model-and-provider";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  inferInitialView,
  type SettingsFormValues,
  type SettingsView,
} from "#/utils/sdk-settings-schema";
import { DEFAULT_SETTINGS } from "#/services/settings";
import {
  DEFAULT_OPENAI_SUBSCRIPTION_MODEL,
  LLM_AUTH_TYPE_API_KEY,
  LLM_AUTH_TYPE_KEY,
  LLM_AUTH_TYPE_SUBSCRIPTION,
  LLM_SUBSCRIPTION_VENDOR_KEY,
  OPENAI_SUBSCRIPTION_VENDOR,
  isOpenAISubscriptionModel,
  resolveLlmAuthType,
} from "#/constants/llm-subscription";
import { useOpenAISubscriptionModels } from "#/hooks/query/use-llm-subscription-models";

const LLM_EXCLUDED_KEYS = new Set([
  "llm.model",
  "llm.api_key",
  "llm.base_url",
  LLM_AUTH_TYPE_KEY,
  LLM_SUBSCRIPTION_VENDOR_KEY,
]);

const buildModelId = (provider: string | null, model: string | null) => {
  if (!provider || !model) return null;
  return `${provider}/${model}`;
};

const getSchemaFieldDefaultValue = (
  schema: SettingsSchema | null | undefined,
  fieldKey: string,
) =>
  schema?.sections
    .flatMap((section) => section.fields)
    .find((field) => field.key === fieldKey)?.default ?? null;

const KNOWN_PROVIDER_DEFAULT_BASE_URLS: Partial<Record<string, Set<string>>> = {
  openai: new Set(["https://api.openai.com", "https://api.openai.com/v1"]),
  openhands: new Set([
    "https://llm-proxy.app.all-hands.dev",
    "https://llm-proxy.app.all-hands.dev/v1",
  ]),
  litellm_proxy: new Set([
    "https://llm-proxy.app.all-hands.dev",
    "https://llm-proxy.app.all-hands.dev/v1",
  ]),
};

const normalizeBaseUrl = (baseUrl: string) => {
  try {
    const parsedUrl = new URL(baseUrl);
    const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "") || "";
    return `${parsedUrl.origin}${normalizedPath}`;
  } catch {
    return baseUrl.trim().replace(/\/+$/, "");
  }
};

const isProviderDefaultBaseUrl = (model: string, baseUrl: string) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const { provider } = extractModelAndProvider(model);

  if (provider) {
    const knownDefaults = KNOWN_PROVIDER_DEFAULT_BASE_URLS[provider];
    if (knownDefaults) {
      return knownDefaults.has(normalizedBaseUrl);
    }
  }

  return Object.values(KNOWN_PROVIDER_DEFAULT_BASE_URLS).some((knownDefaults) =>
    knownDefaults?.has(normalizedBaseUrl),
  );
};

interface OpenHandsApiKeyHelpProps {
  testId: string;
}

function OpenHandsApiKeyHelp({ testId }: OpenHandsApiKeyHelpProps) {
  const { t } = useTranslation("openhands");

  return (
    <HelpLink
      testId={testId}
      text={t(I18nKey.SETTINGS$OPENHANDS_API_KEY_HELP_TEXT)}
      linkText={t(I18nKey.SETTINGS$NAV_API_KEYS)}
      href="https://app.all-hands.dev/settings/api-keys"
      suffix={` ${t(I18nKey.SETTINGS$OPENHANDS_API_KEY_HELP_SUFFIX)}`}
    />
  );
}

export function LlmSettingsScreen({
  scope = "personal",
  onSaveSuccess,
  initialValueOverrides,
  embedded,
  hideSaveButton,
  onSaveControlChange,
}: {
  scope?: SettingsScope;
  /** Optional hook fired after a successful save (e.g. advance an onboarding step). */
  onSaveSuccess?: () => void;
  /** Forwarded to {@link SdkSectionPage}. */
  initialValueOverrides?: SettingsFormValues;
  /** Forwarded to {@link SdkSectionPage}. */
  embedded?: boolean;
  /** Forwarded to {@link SdkSectionPage}. */
  hideSaveButton?: boolean;
  /** Forwarded to {@link SdkSectionPage}. */
  onSaveControlChange?: (control: SdkSectionSaveControl) => void;
}) {
  const { t } = useTranslation("openhands");

  const { data: settings } = useSettings(scope);
  const { data: schema } = useAgentSettingsSchema(
    settings?.agent_settings_schema,
  );
  const { data: subscriptionModels } = useOpenAISubscriptionModels();

  const defaultModel = String(
    (DEFAULT_SETTINGS.agent_settings?.llm as Record<string, unknown>)?.model ??
      "",
  );

  const getInitialView = React.useCallback(
    (
      currentSettings: Settings,
      filteredSchema: SettingsSchema,
    ): SettingsView => {
      const schemaView = inferInitialView(currentSettings, filteredSchema);
      if (schemaView !== "basic") {
        return schemaView;
      }

      const currentModel = currentSettings.llm_model ?? "";
      const trimmedBaseUrl = currentSettings.llm_base_url?.trim() ?? "";
      const hasCustomBaseUrl =
        trimmedBaseUrl.length > 0 &&
        !isProviderDefaultBaseUrl(currentModel, trimmedBaseUrl);

      return hasCustomBaseUrl ? "all" : "basic";
    },
    [],
  );

  const buildHeader = React.useCallback(
    ({ values, isDisabled, view, onChange }: SdkSectionHeaderProps) => {
      const modelValue =
        typeof values["llm.model"] === "string" ? values["llm.model"] : "";
      const baseUrlValue =
        typeof values["llm.base_url"] === "string"
          ? values["llm.base_url"]
          : "";
      const showOpenHandsApiKeyHelp = modelValue.startsWith("openhands/");
      const authType = resolveLlmAuthType(values[LLM_AUTH_TYPE_KEY]);
      const isSubscriptionAuth = authType === LLM_AUTH_TYPE_SUBSCRIPTION;
      const subscriptionModelValue = isOpenAISubscriptionModel(modelValue)
        ? modelValue
        : DEFAULT_OPENAI_SUBSCRIPTION_MODEL;

      const apiKeyValue =
        typeof values["llm.api_key"] === "string" ? values["llm.api_key"] : "";
      // For embedded profile forms (create/edit) the global
      // `llm_api_key_set` flag is misleading: a brand-new profile would show a
      // "key set" indicator just because some other profile has a key. Reflect
      // the form's own key state instead so create mode starts visibly unset.
      const apiKeyIsSet = embedded
        ? apiKeyValue.length > 0
        : Boolean(settings?.llm_api_key_set);

      const renderApiKeyInput = (testId: string, helpTestId: string) => (
        <>
          <SettingsInput
            testId={testId}
            label={t(I18nKey.SETTINGS_FORM$API_KEY)}
            type="password"
            className="w-full"
            value={apiKeyValue}
            placeholder={apiKeyIsSet ? "<hidden>" : ""}
            onChange={(value) => onChange("llm.api_key", value)}
            isDisabled={isDisabled}
            startContent={
              apiKeyIsSet ? <KeyStatusIcon isSet={apiKeyIsSet} /> : undefined
            }
          />

          <HelpLink
            testId={helpTestId}
            text={t(I18nKey.SETTINGS$DONT_KNOW_API_KEY)}
            linkText={t(I18nKey.SETTINGS$CLICK_FOR_INSTRUCTIONS)}
            href="https://docs.openhands.dev/usage/local-setup#getting-an-api-key"
          />
        </>
      );

      const handleAuthTypeChange = (selectedKey: React.Key | null) => {
        const nextAuthType =
          selectedKey === LLM_AUTH_TYPE_SUBSCRIPTION
            ? LLM_AUTH_TYPE_SUBSCRIPTION
            : LLM_AUTH_TYPE_API_KEY;
        onChange(LLM_AUTH_TYPE_KEY, nextAuthType);

        if (nextAuthType === LLM_AUTH_TYPE_SUBSCRIPTION) {
          onChange(LLM_SUBSCRIPTION_VENDOR_KEY, OPENAI_SUBSCRIPTION_VENDOR);
          if (!isOpenAISubscriptionModel(modelValue)) {
            onChange("llm.model", DEFAULT_OPENAI_SUBSCRIPTION_MODEL);
          }
        } else if (isOpenAISubscriptionModel(modelValue)) {
          onChange("llm.model", defaultModel);
        }
      };

      const renderAuthTypeInput = () => (
        <SettingsDropdownInput
          testId="llm-auth-type-input"
          name={LLM_AUTH_TYPE_KEY}
          label={t(I18nKey.SETTINGS$LLM_AUTH_TYPE)}
          items={[
            {
              key: LLM_AUTH_TYPE_API_KEY,
              label: t(I18nKey.SETTINGS$LLM_AUTH_TYPE_API_KEY),
            },
            {
              key: LLM_AUTH_TYPE_SUBSCRIPTION,
              label: t(I18nKey.SETTINGS$LLM_AUTH_TYPE_SUBSCRIPTION),
            },
          ]}
          selectedKey={authType}
          isClearable={false}
          required
          isDisabled={isDisabled}
          onSelectionChange={handleAuthTypeChange}
        />
      );

      const renderSubscriptionSettings = () => (
        <div
          className="flex flex-col gap-6"
          data-testid="llm-subscription-settings"
        >
          <SettingsDropdownInput
            testId="llm-subscription-model-input"
            name="llm.subscription_model"
            label={t(I18nKey.SETTINGS$SUBSCRIPTION_MODEL)}
            items={(subscriptionModels ?? []).map((model) => ({
              key: model,
              label: model,
            }))}
            selectedKey={subscriptionModelValue}
            isClearable={false}
            required
            isDisabled={isDisabled}
            onSelectionChange={(selectedKey) => {
              onChange(
                "llm.model",
                String(selectedKey ?? DEFAULT_OPENAI_SUBSCRIPTION_MODEL),
              );
            }}
          />
          <OpenAISubscriptionAuthCard isDisabled={isDisabled} />
        </div>
      );

      return (
        <div className="flex flex-col gap-6">
          {view === "basic" ? (
            <div
              className="flex flex-col gap-6"
              data-testid="llm-settings-form-basic"
            >
              {renderAuthTypeInput()}

              {isSubscriptionAuth ? (
                renderSubscriptionSettings()
              ) : (
                <>
                  <ModelSelector
                    currentModel={modelValue || undefined}
                    currentBaseUrl={baseUrlValue || undefined}
                    onChange={(provider, model) => {
                      const nextModel = buildModelId(provider, model);
                      if (nextModel) {
                        onChange("llm.model", nextModel);
                      }
                    }}
                    wrapperClassName="!flex-col !gap-6"
                    isDisabled={isDisabled}
                  />

                  {showOpenHandsApiKeyHelp ? (
                    <OpenHandsApiKeyHelp testId="openhands-api-key-help" />
                  ) : null}

                  {renderApiKeyInput(
                    "llm-api-key-input",
                    "llm-api-key-help-anchor",
                  )}
                </>
              )}
            </div>
          ) : (
            <div
              className="flex flex-col gap-6"
              data-testid="llm-settings-form-advanced"
            >
              {renderAuthTypeInput()}

              {isSubscriptionAuth ? (
                renderSubscriptionSettings()
              ) : (
                <>
                  <SettingsInput
                    testId="llm-custom-model-input"
                    label={t(I18nKey.SETTINGS$CUSTOM_MODEL)}
                    type="text"
                    className="w-full"
                    value={modelValue}
                    placeholder={defaultModel}
                    onChange={(value) => onChange("llm.model", value)}
                    isDisabled={isDisabled}
                  />

                  {showOpenHandsApiKeyHelp ? (
                    <OpenHandsApiKeyHelp testId="openhands-api-key-help-2" />
                  ) : null}

                  <SettingsInput
                    testId="base-url-input"
                    label={t(I18nKey.SETTINGS$BASE_URL)}
                    type="text"
                    className="w-full"
                    value={baseUrlValue}
                    placeholder="https://api.openai.com"
                    onChange={(value) => onChange("llm.base_url", value)}
                    isDisabled={isDisabled}
                  />

                  {renderApiKeyInput(
                    "llm-api-key-input",
                    "llm-api-key-help-anchor-advanced",
                  )}
                </>
              )}
            </div>
          )}
        </div>
      );
    },
    [defaultModel, embedded, settings?.llm_api_key_set, t],
  );

  const buildPayload = React.useCallback(
    (
      basePayload: Record<string, unknown>,
      context: {
        values: Record<string, string | boolean>;
        dirty: Record<string, boolean>;
        view: SettingsView;
      },
    ) => {
      const agentSettings = structuredClone(basePayload);
      const llm = (agentSettings.llm ?? {}) as Record<string, unknown>;
      const authType = resolveLlmAuthType(context.values[LLM_AUTH_TYPE_KEY]);

      if (authType === LLM_AUTH_TYPE_SUBSCRIPTION) {
        llm.auth_type = LLM_AUTH_TYPE_SUBSCRIPTION;
        llm.subscription_vendor = OPENAI_SUBSCRIPTION_VENDOR;
        const model =
          typeof llm.model === "string"
            ? llm.model
            : String(context.values["llm.model"] ?? "");
        llm.model = isOpenAISubscriptionModel(model)
          ? model
          : DEFAULT_OPENAI_SUBSCRIPTION_MODEL;
        delete llm.api_key;
        delete llm.base_url;
      } else {
        if (context.dirty[LLM_AUTH_TYPE_KEY]) {
          llm.auth_type = LLM_AUTH_TYPE_API_KEY;
          llm.subscription_vendor = null;
        }
        if (context.view === "basic") {
          llm.base_url = getSchemaFieldDefaultValue(schema, "llm.base_url");
        }
      }

      agentSettings.llm = llm;
      return { agent_settings_diff: agentSettings };
    },
    [schema],
  );

  return (
    <SdkSectionPage
      scope={scope}
      sectionKeys={["llm"]}
      excludeKeys={LLM_EXCLUDED_KEYS}
      header={buildHeader}
      buildPayload={buildPayload}
      getInitialView={getInitialView}
      forceShowAdvancedView
      allowAllView
      onSaveSuccess={onSaveSuccess}
      initialValueOverrides={initialValueOverrides}
      embedded={embedded}
      hideSaveButton={hideSaveButton}
      onSaveControlChange={onSaveControlChange}
      testId="llm-settings-screen"
    />
  );
}

/**
 * Default export for the route renders different views based on backend type:
 * - Local backends: LlmSettingsLocalView with profile management
 * - Cloud backends: Standard LlmSettingsScreen (profiles are not supported)
 *
 * The LlmSettingsScreen component is also exported for embedded use cases
 * (e.g., onboarding, profile editing forms).
 *
 * Note: This is a route file, only the router should import the default export.
 * Other consumers should use the named export `LlmSettingsScreen` for embedded
 * use cases.
 */
export default function LlmSettingsRoute() {
  const { backend } = useActiveBackend();
  const isCloud = backend.kind === "cloud";

  // Cloud backends use the standard LLM settings form (no profiles support)
  if (isCloud) {
    return <LlmSettingsScreen />;
  }

  // Local backends use the profile management view
  return <LlmSettingsLocalView />;
}
