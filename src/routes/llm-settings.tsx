import React from "react";
import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ModelSelector } from "#/components/shared/modals/settings/model-selector";
import { useAgentSettingsSchema } from "#/hooks/query/use-agent-settings-schema";
import { useSettings } from "#/hooks/query/use-settings";
import { SettingsInput } from "#/components/features/settings/settings-input";
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
import { DeviceFlowAuth } from "#/components/features/backends/device-flow-auth";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  getStoredCloudBackendCredentials,
  getOpenHandsProvidedLlmApiKey,
  makeDefaultOpenHandsCloudCredential,
  saveCloudBackendCredential,
} from "#/api/cloud-backend-credentials-service";
import {
  DEFAULT_OPENHANDS_CLOUD_HOST,
  OPENHANDS_CLOUD_DISPLAY_NAME,
  OPENHANDS_LLM_PROXY_BASE_URLS,
} from "#/utils/constants";

const LLM_EXCLUDED_KEYS = new Set(["llm.model", "llm.api_key", "llm.base_url"]);

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
  openhands: new Set<string>(OPENHANDS_LLM_PROXY_BASE_URLS),
  litellm_proxy: new Set<string>(OPENHANDS_LLM_PROXY_BASE_URLS),
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

interface OpenHandsCloudAuth {
  id: string;
  name: string;
  host: string;
  cloudApiKey: string;
}

const normalizeAuthHost = (host: string) =>
  host.trim().replace(/\/+$/, "") || DEFAULT_OPENHANDS_CLOUD_HOST;

function formatCloudAuthLabel(auth: OpenHandsCloudAuth) {
  return `${auth.name} (${normalizeAuthHost(auth.host)})`;
}

function dedupeCloudAuths(auths: OpenHandsCloudAuth[]) {
  const seen = new Set<string>();
  return auths.filter((auth) => {
    const apiKey = auth.cloudApiKey.trim();
    if (!apiKey) return false;

    const key = `${normalizeAuthHost(auth.host)}\n${apiKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function findReusableOpenHandsCloudAuths(
  options: { signal?: AbortSignal } = {},
): Promise<OpenHandsCloudAuth[]> {
  return dedupeCloudAuths(await getStoredCloudBackendCredentials(options));
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "ERR_CANCELED")
  );
}

interface OpenHandsApiKeyAuthProps {
  testId: string;
  onApiKeyObtained: (key: string) => void;
  isDisabled?: boolean;
}

/**
 * Auth section shown when an `openhands/*` model is selected. Provides
 * three ways to obtain the API key, in order of convenience:
 *
 * 1. Fetch an OpenHands-provided LM API key if the user already has a
 *    Cloud API key available.
 * 2. "Login with OpenHands" — device flow OAuth to get a Cloud API key,
 *    then fetch the LM API key from Cloud.
 * 3. Manual entry — the standard API key input (rendered separately by
 *    the caller below this component).
 */
function OpenHandsApiKeyAuth({
  testId,
  onApiKeyObtained,
  isDisabled,
}: OpenHandsApiKeyAuthProps) {
  const { t } = useTranslation("openhands");
  const [cloudAuths, setCloudAuths] = React.useState<OpenHandsCloudAuth[]>([]);
  const [selectedCloudAuthId, setSelectedCloudAuthId] = React.useState("");
  const [isLoadingCloudAuths, setIsLoadingCloudAuths] = React.useState(true);
  const [isFetchingLlmApiKey, setIsFetchingLlmApiKey] = React.useState(false);
  const [llmApiKeyError, setLlmApiKeyError] = React.useState<string | null>(
    null,
  );
  const [cloudAuthError, setCloudAuthError] = React.useState<string | null>(
    null,
  );
  const [deviceFlowLlmApiKeyError, setDeviceFlowLlmApiKeyError] =
    React.useState<string | null>(null);
  const cloudAuthLoadAbortRef = React.useRef<AbortController | null>(null);
  const llmApiKeyAbortRef = React.useRef<AbortController | null>(null);
  const cloudAuthCallbackAbortRef = React.useRef<AbortController | null>(null);
  const translateRef = React.useRef(t);
  const onApiKeyObtainedRef = React.useRef(onApiKeyObtained);

  React.useEffect(() => {
    translateRef.current = t;
  }, [t]);

  React.useEffect(() => {
    onApiKeyObtainedRef.current = onApiKeyObtained;
  }, [onApiKeyObtained]);

  React.useEffect(() => {
    const callbackAbortController = new AbortController();
    cloudAuthCallbackAbortRef.current = callbackAbortController;

    return () => {
      callbackAbortController.abort();
      if (cloudAuthCallbackAbortRef.current === callbackAbortController) {
        cloudAuthCallbackAbortRef.current = null;
      }
      cloudAuthLoadAbortRef.current?.abort();
      llmApiKeyAbortRef.current?.abort();
    };
  }, []);

  const getComponentAbortSignal = React.useCallback(
    () => cloudAuthCallbackAbortRef.current?.signal ?? null,
    [],
  );

  const isComponentAborted = React.useCallback(
    (signal: AbortSignal | null = getComponentAbortSignal()) =>
      signal?.aborted ?? false,
    [getComponentAbortSignal],
  );

  const loadCloudAuths = React.useCallback(async () => {
    const componentSignal = cloudAuthCallbackAbortRef.current?.signal;
    if (!componentSignal || componentSignal.aborted) return;
    cloudAuthLoadAbortRef.current?.abort();
    const controller = new AbortController();
    cloudAuthLoadAbortRef.current = controller;
    if (isComponentAborted(componentSignal)) return;
    setIsLoadingCloudAuths(true);
    setCloudAuthError(null);
    try {
      const auths = await findReusableOpenHandsCloudAuths({
        signal: controller.signal,
      });
      if (controller.signal.aborted || isComponentAborted(componentSignal)) {
        return;
      }
      setCloudAuths(auths);
      setSelectedCloudAuthId(auths.length === 1 ? auths[0].id : "");
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      if (isComponentAborted(componentSignal)) return;
      console.error("Failed to load OpenHands Cloud credentials", error);
      setCloudAuths([]);
      setSelectedCloudAuthId("");
      setCloudAuthError(
        translateRef.current(
          I18nKey.SETTINGS$OPENHANDS_CLOUD_CREDENTIALS_LOAD_FAILED,
        ),
      );
    } finally {
      if (cloudAuthLoadAbortRef.current === controller) {
        cloudAuthLoadAbortRef.current = null;
      }
      if (!controller.signal.aborted && !componentSignal.aborted) {
        setIsLoadingCloudAuths(false);
      }
    }
  }, [isComponentAborted]);

  React.useEffect(() => {
    void loadCloudAuths();
  }, [loadCloudAuths]);

  const selectedCloudAuth = React.useMemo(
    () => cloudAuths.find((auth) => auth.id === selectedCloudAuthId) ?? null,
    [cloudAuths, selectedCloudAuthId],
  );

  const fetchAndApplyLlmApiKey = React.useCallback(
    async (
      auth: OpenHandsCloudAuth,
      source: "reusable" | "device",
      componentSignal = getComponentAbortSignal(),
    ) => {
      if (isComponentAborted(componentSignal)) return;
      const setFetchError =
        source === "device" ? setDeviceFlowLlmApiKeyError : setLlmApiKeyError;
      llmApiKeyAbortRef.current?.abort();
      const controller = new AbortController();
      llmApiKeyAbortRef.current = controller;
      if (isComponentAborted(componentSignal)) return;
      setIsFetchingLlmApiKey(true);
      setLlmApiKeyError(null);
      setDeviceFlowLlmApiKeyError(null);
      try {
        const llmApiKey = await getOpenHandsProvidedLlmApiKey({
          cloudApiKey: auth.cloudApiKey,
          host: auth.host,
          signal: controller.signal,
        });
        if (controller.signal.aborted || isComponentAborted(componentSignal)) {
          return;
        }
        const normalizedLlmApiKey = llmApiKey?.trim() ?? "";

        if (!normalizedLlmApiKey) {
          if (isComponentAborted(componentSignal)) return;
          setFetchError(
            translateRef.current(
              I18nKey.SETTINGS$OPENHANDS_LM_API_KEY_FETCH_FAILED,
            ),
          );
          return;
        }

        if (isComponentAborted(componentSignal)) return;
        onApiKeyObtainedRef.current(normalizedLlmApiKey);
      } catch (error) {
        if (
          isAbortError(error) ||
          controller.signal.aborted ||
          isComponentAborted(componentSignal)
        ) {
          return;
        }
        console.error(
          "Failed to fetch OpenHands-provided LM API key from Cloud",
          error,
        );
        if (isComponentAborted(componentSignal)) return;
        setFetchError(
          translateRef.current(
            I18nKey.SETTINGS$OPENHANDS_LM_API_KEY_FETCH_FAILED,
          ),
        );
      } finally {
        if (
          !controller.signal.aborted &&
          !isComponentAborted(componentSignal) &&
          llmApiKeyAbortRef.current === controller
        ) {
          llmApiKeyAbortRef.current = null;
          setIsFetchingLlmApiKey(false);
        }
      }
    },
    [getComponentAbortSignal, isComponentAborted],
  );

  const handleCloudApiKeyObtained = React.useCallback(
    async (cloudApiKey: string) => {
      const callbackSignal = getComponentAbortSignal();
      if (isComponentAborted(callbackSignal)) return;

      const auth = makeDefaultOpenHandsCloudCredential(cloudApiKey);
      setDeviceFlowLlmApiKeyError(null);

      try {
        const savedAuth = await saveCloudBackendCredential(auth, {
          signal: callbackSignal ?? undefined,
        });
        if (isComponentAborted(callbackSignal)) return;
        setCloudAuths((existing) => dedupeCloudAuths([savedAuth, ...existing]));
        if (isComponentAborted(callbackSignal)) return;
        setSelectedCloudAuthId(savedAuth.id);
        if (isComponentAborted(callbackSignal)) return;
        await fetchAndApplyLlmApiKey(savedAuth, "device", callbackSignal);
      } catch (error) {
        if (isAbortError(error) || isComponentAborted(callbackSignal)) return;
        console.warn(
          `Failed to persist OpenHands Cloud credential for ${auth.id}`,
          error,
        );
        if (isComponentAborted(callbackSignal)) return;
        setDeviceFlowLlmApiKeyError(
          translateRef.current(
            I18nKey.SETTINGS$OPENHANDS_LM_API_KEY_FETCH_FAILED,
          ),
        );
      }
    },
    [fetchAndApplyLlmApiKey, getComponentAbortSignal, isComponentAborted],
  );

  const handleFetchSelectedLlmApiKey = React.useCallback(() => {
    if (!selectedCloudAuth) return;
    void fetchAndApplyLlmApiKey(selectedCloudAuth, "reusable");
  }, [fetchAndApplyLlmApiKey, selectedCloudAuth]);

  const hasReusableCloudAuth = cloudAuths.length > 0;
  const requiresCloudAuthSelection = cloudAuths.length > 1;

  return (
    <div
      className="flex flex-col gap-3 max-w-[680px]"
      data-testid={`${testId}-auth`}
    >
      {/* Option 1: Use existing OpenHands Cloud auth to fetch an LM API key */}
      {isLoadingCloudAuths && (
        <p
          className="text-xs text-[var(--oh-muted)]"
          data-testid={`${testId}-cloud-auth-loading`}
          role="status"
        >
          {t(I18nKey.HOME$LOADING)}
        </p>
      )}

      {cloudAuthError && (
        <div className="flex flex-col gap-2" role="alert">
          <p
            className="text-xs text-red-400"
            data-testid={`${testId}-cloud-auth-error`}
          >
            {cloudAuthError}
          </p>
          <BrandButton
            type="button"
            variant="secondary"
            onClick={() => void loadCloudAuths()}
            testId={`${testId}-cloud-auth-retry`}
            isDisabled={isDisabled || isLoadingCloudAuths}
          >
            {t(I18nKey.BACKEND$AUTH_RETRY)}
          </BrandButton>
        </div>
      )}

      {hasReusableCloudAuth && (
        <div
          className="flex flex-col gap-2"
          data-testid={`${testId}-cloud-login-detected`}
        >
          <p className="text-xs text-[var(--oh-muted)]">
            {t(I18nKey.SETTINGS$OPENHANDS_CLOUD_LOGIN_DETECTED, {
              name:
                cloudAuths.length === 1
                  ? formatCloudAuthLabel(cloudAuths[0])
                  : OPENHANDS_CLOUD_DISPLAY_NAME,
            })}
          </p>
          {requiresCloudAuthSelection && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--oh-muted)]">
                {t(I18nKey.SETTINGS$OPENHANDS_CLOUD_LOGIN_SELECT_LABEL)}
              </span>
              <select
                aria-label={t(
                  I18nKey.SETTINGS$OPENHANDS_CLOUD_LOGIN_SELECT_LABEL,
                )}
                data-testid={`${testId}-cloud-auth-select`}
                value={selectedCloudAuthId}
                onChange={(event) => setSelectedCloudAuthId(event.target.value)}
                className="h-10 rounded-sm border border-[var(--oh-border-input)] bg-tertiary px-2 text-sm text-white outline-none"
                disabled={isDisabled || isFetchingLlmApiKey}
              >
                <option value="" disabled>
                  {t(I18nKey.SETTINGS$OPENHANDS_CLOUD_LOGIN_SELECT_PLACEHOLDER)}
                </option>
                {cloudAuths.map((auth) => (
                  <option key={auth.id} value={auth.id}>
                    {formatCloudAuthLabel(auth)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <BrandButton
            type="button"
            variant="secondary"
            onClick={handleFetchSelectedLlmApiKey}
            testId={`${testId}-get-openhands-lm-key`}
            isDisabled={isDisabled || isFetchingLlmApiKey || !selectedCloudAuth}
            startContent={<KeyRound className="h-4 w-4" aria-hidden />}
          >
            {isFetchingLlmApiKey
              ? t(I18nKey.SETTINGS$FETCHING_OPENHANDS_LM_API_KEY)
              : t(I18nKey.SETTINGS$GET_OPENHANDS_LM_API_KEY)}
          </BrandButton>
          {llmApiKeyError && (
            <p className="text-xs text-red-400" role="alert">
              {llmApiKeyError}
            </p>
          )}
        </div>
      )}

      {/* Option 2: Device flow login */}
      <DeviceFlowAuth
        host={DEFAULT_OPENHANDS_CLOUD_HOST}
        onSuccess={handleCloudApiKeyObtained}
        testIdRoot={testId}
        isDisabled={isDisabled}
      />
      {deviceFlowLlmApiKeyError && (
        <p
          className="text-xs text-red-400"
          data-testid={`${testId}-device-flow-lm-key-error`}
          role="alert"
        >
          {deviceFlowLlmApiKeyError}
        </p>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-tertiary" />
        <span className="text-xs text-tertiary-alt">
          {t(I18nKey.SETTINGS$OR_ENTER_MANUALLY)}
        </span>
        <div className="flex-1 border-t border-tertiary" />
      </div>
    </div>
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
      const isOpenHandsModel = modelValue.startsWith("openhands/");

      const handleApiKeyObtained = (key: string) => {
        onChange("llm.api_key", key);
      };

      const renderApiKeySection = (testId: string, helpTestId: string) => (
        <>
          {isOpenHandsModel ? (
            <OpenHandsApiKeyAuth
              testId={testId}
              onApiKeyObtained={handleApiKeyObtained}
              isDisabled={isDisabled}
            />
          ) : null}

          <SettingsInput
            testId={testId}
            label={t(I18nKey.SETTINGS_FORM$API_KEY)}
            type="password"
            className="w-full"
            value={
              typeof values["llm.api_key"] === "string"
                ? values["llm.api_key"]
                : ""
            }
            placeholder={settings?.llm_api_key_set ? "<hidden>" : ""}
            onChange={(value) => onChange("llm.api_key", value)}
            isDisabled={isDisabled}
            startContent={
              settings?.llm_api_key_set ? (
                <KeyStatusIcon isSet={settings.llm_api_key_set} />
              ) : undefined
            }
          />

          {!isOpenHandsModel && (
            <HelpLink
              testId={helpTestId}
              text={t(I18nKey.SETTINGS$DONT_KNOW_API_KEY)}
              linkText={t(I18nKey.SETTINGS$CLICK_FOR_INSTRUCTIONS)}
              href="https://docs.openhands.dev/usage/local-setup#getting-an-api-key"
            />
          )}
        </>
      );

      return (
        <div className="flex flex-col gap-6">
          {view === "basic" ? (
            <div
              className="flex flex-col gap-6"
              data-testid="llm-settings-form-basic"
            >
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

              {renderApiKeySection(
                "llm-api-key-input",
                "llm-api-key-help-anchor",
              )}
            </div>
          ) : (
            <div
              className="flex flex-col gap-6"
              data-testid="llm-settings-form-advanced"
            >
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

              {renderApiKeySection(
                "llm-api-key-input",
                "llm-api-key-help-anchor-advanced",
              )}
            </div>
          )}
        </div>
      );
    },
    [defaultModel, settings?.llm_api_key_set, t],
  );

  const buildPayload = React.useCallback(
    (
      basePayload: Record<string, unknown>,
      context: {
        values: Record<string, string | boolean>;
        view: SettingsView;
      },
    ) => {
      // basePayload is a nested dict (e.g. {llm: {model: "gpt-4"}})
      const agentSettings = structuredClone(basePayload);

      const llm = (agentSettings.llm ?? {}) as Record<string, unknown>;

      if (context.view === "basic") {
        llm.base_url = getSchemaFieldDefaultValue(schema, "llm.base_url");
        agentSettings.llm = llm;
      }

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
