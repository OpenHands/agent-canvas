import React from "react";
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
import { I18nKey } from "#/i18n/declaration";
import { Settings, SettingsSchema, SettingsScope } from "#/types/settings";
import { extractModelAndProvider } from "#/utils/extract-model-and-provider";
import {
  inferInitialView,
  type SettingsFormValues,
  type SettingsView,
} from "#/utils/sdk-settings-schema";
import { DEFAULT_SETTINGS } from "#/services/settings";
import { useSaveLlmProfile } from "#/hooks/mutation/use-save-llm-profile";
import { useRenameLlmProfile } from "#/hooks/mutation/use-rename-llm-profile";
import ProfilesService, {
  type ProfileInfo,
} from "#/api/profiles-service/profiles-service.api";
import {
  deriveProfileNameFromModel,
  PROFILE_NAME_PATTERN,
} from "#/utils/derive-profile-name";
import { ProfileNameInput } from "#/components/features/settings/llm-profiles/profile-name-input";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { BrandButton } from "#/components/features/settings/brand-button";
import { LlmProfilesListView } from "#/components/features/settings/llm-profiles/llm-profiles-list-view";
import { useActiveBackend } from "#/contexts/active-backend-context";

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

type EditMode = "none" | "add" | "edit";

interface LlmSettingsScreenProps {
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
}

/**
 * Cloud mode LLM settings - renders the original simple form without profiles.
 * Cloud backend does not support LLM profiles yet.
 */
function LlmSettingsCloudView({
  scope = "personal",
  onSaveSuccess,
  initialValueOverrides,
  embedded,
  hideSaveButton,
  onSaveControlChange,
}: LlmSettingsScreenProps) {
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
      const showOpenHandsApiKeyHelp = modelValue.startsWith("openhands/");

      const renderApiKeyInput = (testId: string, helpTestId: string) => (
        <>
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

          <HelpLink
            testId={helpTestId}
            text={t(I18nKey.SETTINGS$DONT_KNOW_API_KEY)}
            linkText={t(I18nKey.SETTINGS$CLICK_FOR_INSTRUCTIONS)}
            href="https://docs.openhands.dev/usage/local-setup#getting-an-api-key"
          />
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
                  onChange("llm.model", nextModel ?? "");
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
 * Local mode LLM settings - renders the profile management UI.
 * Profiles are only available in local agent-server mode.
 */
function LlmSettingsLocalView({
  scope = "personal",
  onSaveSuccess: parentOnSaveSuccess,
}: LlmSettingsScreenProps) {
  const { t } = useTranslation("openhands");

  const { data: settings } = useSettings(scope);
  const { data: schema } = useAgentSettingsSchema(
    settings?.agent_settings_schema,
  );

  const saveProfile = useSaveLlmProfile();
  const renameProfile = useRenameLlmProfile();

  // Edit mode: "none" = show profiles list, "add" = new profile form, "edit" = editing existing
  const [editMode, setEditMode] = React.useState<EditMode>("none");
  const [profileName, setProfileName] = React.useState("");
  // Track the original profile name when editing (to detect renames)
  const [originalProfileName, setOriginalProfileName] = React.useState<
    string | null
  >(null);
  // Loaded profile config for edit mode - converted to form values format
  const [editProfileConfig, setEditProfileConfig] =
    React.useState<SettingsFormValues | null>(null);
  // Loading state while fetching profile for edit
  const [isLoadingProfile, setIsLoadingProfile] = React.useState(false);
  // Force form re-render when switching profiles
  const [formKey, setFormKey] = React.useState(0);

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

      const settingsModel = currentSettings.llm_model ?? "";
      const trimmedBaseUrl = currentSettings.llm_base_url?.trim() ?? "";
      const hasCustomBaseUrl =
        trimmedBaseUrl.length > 0 &&
        !isProviderDefaultBaseUrl(settingsModel, trimmedBaseUrl);

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

      const renderApiKeyInput = (testId: string, helpTestId: string) => (
        <>
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

          <HelpLink
            testId={helpTestId}
            text={t(I18nKey.SETTINGS$DONT_KNOW_API_KEY)}
            linkText={t(I18nKey.SETTINGS$CLICK_FOR_INSTRUCTIONS)}
            href="https://docs.openhands.dev/usage/local-setup#getting-an-api-key"
          />
        </>
      );

      return (
        <div className="flex flex-col gap-6">
          {/* Profile name input */}
          <ProfileNameInput
            testId="llm-profile-name-input"
            ruleTestId="llm-profile-name-rule"
            value={profileName}
            onChange={setProfileName}
            placeholder={
              modelValue
                ? deriveProfileNameFromModel(modelValue)
                : t(I18nKey.SETTINGS$PROFILE_NAME_PLACEHOLDER)
            }
            isOptional={editMode === "add"}
            isDisabled={isDisabled}
          />

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

              {showOpenHandsApiKeyHelp ? (
                <OpenHandsApiKeyHelp testId="openhands-api-key-help" />
              ) : null}

              {renderApiKeyInput(
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
            </div>
          )}
        </div>
      );
    },
    [defaultModel, editMode, profileName, settings?.llm_api_key_set, t],
  );

  const buildPayload = React.useCallback(
    (
      basePayload: Record<string, unknown>,
      context: {
        values: Record<string, string | boolean>;
        view: SettingsView;
      },
    ) => {
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

  // Handler for save success - saves the profile and returns to list view
  const handleSaveSuccess = React.useCallback(
    async (savedValues: SettingsFormValues) => {
      const modelValue =
        typeof savedValues["llm.model"] === "string"
          ? savedValues["llm.model"]
          : "";
      const apiKeyValue =
        typeof savedValues["llm.api_key"] === "string"
          ? savedValues["llm.api_key"]
          : undefined;
      const baseUrlValue =
        typeof savedValues["llm.base_url"] === "string"
          ? savedValues["llm.base_url"]
          : undefined;

      const trimmedUserName = profileName.trim();
      const userName = PROFILE_NAME_PATTERN.test(trimmedUserName)
        ? trimmedUserName
        : null;
      const derivedName = modelValue
        ? deriveProfileNameFromModel(modelValue)
        : null;
      const targetName = userName || derivedName;

      // Validate required fields
      if (!targetName || !modelValue) {
        displayErrorToast(t(I18nKey.SETTINGS$PROFILE_NAME_AND_MODEL_REQUIRED));
        return;
      }

      try {
        // When editing an existing profile, check if name changed
        const isEditing = editMode === "edit" && originalProfileName;
        const nameChanged = isEditing && targetName !== originalProfileName;

        if (nameChanged) {
          // Rename first, then save config to the new name
          await renameProfile.mutateAsync({
            name: originalProfileName,
            newName: targetName,
          });
          // Update originalProfileName immediately after successful rename
          // to prevent retry bug: if save fails below, retrying should use
          // the new name (not the old name which no longer exists)
          setOriginalProfileName(targetName);
        }

        // Check if user provided a new API key
        const hasNewApiKey = apiKeyValue && apiKeyValue.trim().length > 0;

        // Build LLM config using SDK's LLM type shape
        const llmConfig: {
          model: string;
          base_url?: string;
          api_key?: string;
        } & Record<string, unknown> = {
          model: modelValue,
          ...(baseUrlValue ? { base_url: baseUrlValue } : {}),
        };

        // When editing an existing profile without a new API key, we need to
        // preserve the existing API key by fetching it with encryption and
        // passing it back in the save request
        if (isEditing && !hasNewApiKey) {
          // Profile name to fetch - use the renamed name if we just renamed
          const profileToFetch = nameChanged ? targetName : originalProfileName;
          try {
            // Fetch the existing profile with encrypted secrets
            const existingProfile = await ProfilesService.getProfile(
              profileToFetch,
              "encrypted",
            );
            // Preserve the encrypted API key if it exists
            const existingApiKey = existingProfile.config?.api_key;
            if (
              existingApiKey &&
              typeof existingApiKey === "string" &&
              existingApiKey.trim()
            ) {
              llmConfig.api_key = existingApiKey;
            }
          } catch (fetchError) {
            // Log and abort save if we can't fetch existing profile - prevents data loss
            console.error(
              "Failed to fetch existing profile for API key preservation:",
              fetchError,
            );
            displayErrorToast(
              t(I18nKey.ERROR$FAILED_TO_LOAD_PROFILE_TRY_AGAIN),
            );
            return;
          }
        } else if (hasNewApiKey) {
          llmConfig.api_key = apiKeyValue;
        }

        // Save the profile config (to existing name or renamed profile)
        // include_secrets should be true when we have any api_key to save
        await saveProfile.mutateAsync({
          name: targetName,
          request: {
            llm: llmConfig,
            include_secrets: Boolean(llmConfig.api_key),
          },
        });
        displaySuccessToast(
          t(I18nKey.SETTINGS$PROFILE_SAVED, { name: targetName }),
        );

        // Reset state only on success - must be inside try block to avoid data loss on error
        setProfileName("");
        setOriginalProfileName(null);
        setEditProfileConfig(null);
        setEditMode("none");

        // Invoke parent callback after successful save
        parentOnSaveSuccess?.();
      } catch (error) {
        console.error("Failed to save profile:", error);
        const message =
          error instanceof Error ? error.message : t(I18nKey.ERROR$GENERIC);
        displayErrorToast(message);
      }
    },
    [
      editMode,
      originalProfileName,
      profileName,
      renameProfile,
      saveProfile,
      t,
      parentOnSaveSuccess,
    ],
  );

  // Handler for "Add Profile" button
  const handleAddProfile = React.useCallback(() => {
    setProfileName("");
    setOriginalProfileName(null);
    setEditProfileConfig(null);
    setEditMode("add");
    setFormKey((prev) => prev + 1);
  }, []);

  // Handler for "Edit Profile" menu action - fetches profile config for form
  const handleEditProfile = React.useCallback(
    async (profile: ProfileInfo) => {
      setProfileName(profile.name);
      setOriginalProfileName(profile.name);
      setIsLoadingProfile(true);
      setEditMode("edit");

      try {
        // Fetch the profile config (without secrets - they are not displayed in form)
        const profileData = await ProfilesService.getProfile(profile.name);

        // Convert profile config to form values format (llm.model, llm.base_url, etc.)
        const formValues: SettingsFormValues = {};
        if (profileData.config) {
          const config = profileData.config as Record<string, unknown>;
          if (config.model) formValues["llm.model"] = String(config.model);
          if (config.base_url)
            formValues["llm.base_url"] = String(config.base_url);
          // Note: api_key is not loaded for display - only preserved on save
        }

        setEditProfileConfig(formValues);
        setFormKey((prev) => prev + 1);
      } catch (error) {
        console.error("Failed to load profile for editing:", error);
        displayErrorToast(t(I18nKey.ERROR$FAILED_TO_LOAD_PROFILE_TRY_AGAIN));
        // Reset back to list view on error
        setEditMode("none");
        setProfileName("");
        setOriginalProfileName(null);
        setEditProfileConfig(null);
      } finally {
        setIsLoadingProfile(false);
      }
    },
    [t],
  );

  // Handler for cancel button in form
  const handleCancel = React.useCallback(() => {
    setProfileName("");
    setOriginalProfileName(null);
    setEditProfileConfig(null);
    setEditMode("none");
  }, []);

  // Stable empty object for new profile form - must not create new reference on every render
  // Otherwise SdkSectionPage will reset form values when parent re-renders (e.g., profile name change)
  const emptyInitialValues = React.useMemo(() => ({}), []);

  // If we're in form mode, show the settings form
  if (editMode !== "none") {
    // When adding a new profile, start with empty form values
    // When editing an existing profile, use the fetched profile config
    const initialValuesOverride =
      editMode === "add"
        ? emptyInitialValues
        : (editProfileConfig ?? undefined);

    // Show loading state while fetching profile for edit
    if (isLoadingProfile) {
      return (
        <div data-testid="llm-settings-screen" className="flex flex-col gap-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              {t(I18nKey.SETTINGS$EDIT_LLM_PROFILE)}
            </h2>
            <BrandButton
              testId="cancel-profile-edit"
              type="button"
              variant="secondary"
              onClick={handleCancel}
            >
              {t(I18nKey.BUTTON$CANCEL)}
            </BrandButton>
          </div>
          <div className="flex items-center justify-center py-8">
            <span className="text-gray-400">
              {t(I18nKey.LOADING_PROJECT$LOADING)}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div data-testid="llm-settings-screen" className="flex flex-col gap-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            {editMode === "add"
              ? t(I18nKey.SETTINGS$ADD_LLM_PROFILE)
              : t(I18nKey.SETTINGS$EDIT_LLM_PROFILE)}
          </h2>
          <BrandButton
            testId="cancel-profile-edit"
            type="button"
            variant="secondary"
            onClick={handleCancel}
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
        </div>

        <SdkSectionPage
          key={formKey}
          scope={scope}
          sectionKeys={["llm"]}
          excludeKeys={LLM_EXCLUDED_KEYS}
          header={buildHeader}
          buildPayload={buildPayload}
          getInitialView={getInitialView}
          forceShowAdvancedView
          allowAllView
          onSaveSuccess={handleSaveSuccess}
          testId="llm-profile-form"
          initialValuesOverride={initialValuesOverride}
        />
      </div>
    );
  }

  // Default view: show profiles list only
  return (
    <div data-testid="llm-settings-screen" className="flex flex-col gap-4">
      <LlmProfilesListView
        onAddProfile={handleAddProfile}
        onEditProfile={handleEditProfile}
      />
    </div>
  );
}

/**
 * Main LLM settings screen that switches between cloud and local mode views.
 * - Cloud mode: Simple form without profiles (cloud doesn't support profiles yet)
 * - Local mode: Profile management UI with list and edit views
 */
export function LlmSettingsScreen(props: LlmSettingsScreenProps) {
  const { backend } = useActiveBackend();
  const isCloud = backend.kind === "cloud";

  if (isCloud) {
    return <LlmSettingsCloudView {...props} />;
  }

  return <LlmSettingsLocalView {...props} />;
}

export default LlmSettingsScreen;
