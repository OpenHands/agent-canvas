import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { LlmProfilesManager } from "./llm-profiles-manager";
import { ProfileNameInput } from "./profile-name-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  LlmConnectionStatus,
  type LlmVerifyState,
} from "#/components/features/settings/llm-settings/llm-connection-status";
import { verifyLlmConfig } from "#/api/llm-verify-service";
import { LlmSettingsScreen } from "#/routes/llm-settings";
import { useSaveLlmProfile } from "#/hooks/mutation/use-save-llm-profile";
import { useActivateLlmProfile } from "#/hooks/mutation/use-activate-llm-profile";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useSettings } from "#/hooks/query/use-settings";
import { useAgentSettingsSchema } from "#/hooks/query/use-agent-settings-schema";
import ProfilesService, {
  ProfileInfo,
} from "#/api/profiles-service/profiles-service.api";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";
import {
  deriveProfileNameFromModel,
  isProfileNameValid,
} from "#/utils/derive-profile-name";
import { SdkSectionSaveControl } from "../sdk-settings/sdk-section-page";
import {
  normalizeFieldValue,
  SettingsFormValues,
} from "#/utils/sdk-settings-schema";
import { BackNavButton } from "#/components/shared/buttons/back-nav-button";
import { Typography } from "#/ui/typography";
import { useSettingsSectionHeader } from "#/contexts/settings-section-header-context";

type ViewMode = "list" | "create" | "edit";

interface EditingProfile {
  profile: ProfileInfo;
  initialValues: SettingsFormValues;
  /**
   * The profile's full LLM config (flat keys; `api_key` is the encrypted
   * token). Used as the merge base on save so fields the user did not touch —
   * including ones hidden in the current tab or absent from the schema — are
   * preserved instead of being reset to LLM defaults by the full-replace save.
   */
  baseConfig: Record<string, unknown>;
}

export function shouldReapplyProfileAfterSave({
  activeProfileName,
  originalName,
  savedName,
}: {
  activeProfileName: string | null | undefined;
  originalName: string | null | undefined;
  savedName: string;
}): boolean {
  if (!activeProfileName) return false;
  if (originalName) return activeProfileName === originalName;
  return activeProfileName === savedName;
}

/**
 * LlmSettingsLocalView provides an integrated view for managing LLM profiles
 * in local agent-server mode. It supports listing, creating, and editing profiles.
 *
 * Note: This component manages multiple responsibilities (view state, validation,
 * form coordination, save logic). A future refactoring could extract these into
 * separate hooks (e.g., useProfileForm, useProfileSave) for better testability.
 * See PR review feedback for details.
 */

export function LlmSettingsLocalView() {
  const { t } = useTranslation("openhands");
  const { setHideSectionHeader } = useSettingsSectionHeader();
  const saveProfile = useSaveLlmProfile();
  const activateProfile = useActivateLlmProfile();
  const { data: profilesData } = useLlmProfiles();
  const { data: settings } = useSettings();
  const { data: agentSchema } = useAgentSettingsSchema(
    settings?.agent_settings_schema,
  );

  // Always hold the freshest schema. `handleEditProfile` awaits a network
  // round-trip before seeding the form, so reading the schema from a ref
  // (rather than the value captured in the callback's closure) picks up a
  // schema that finished loading during that await. This closes the brief
  // first-load window where the schema is still pending when Edit is clicked
  // and would otherwise seed only the three hard-coded keys.
  const agentSchemaRef = useRef(agentSchema);
  agentSchemaRef.current = agentSchema;

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [profileName, setProfileName] = useState("");
  const [editingProfile, setEditingProfile] = useState<EditingProfile | null>(
    null,
  );
  const [saveControl, setSaveControl] = useState<SdkSectionSaveControl | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [verifyState, setVerifyState] = useState<LlmVerifyState>({
    status: "idle",
  });
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    setHideSectionHeader(viewMode !== "list");
    return () => setHideSectionHeader(false);
  }, [viewMode, setHideSectionHeader]);

  // Get existing profile names for validation
  const existingNames = useMemo(
    () => new Set(profilesData?.profiles.map((p) => p.name) ?? []),
    [profilesData],
  );

  // Validate profile name. The shared validator rejects any whitespace, so
  // duplicate checks below compare the raw value directly.
  const isNameValid = useMemo(() => {
    if (!isProfileNameValid(profileName, { isRequired: true })) return false;
    // In create mode, check for duplicates
    if (viewMode === "create" && existingNames.has(profileName)) return false;
    // In edit mode, name can match current profile name
    if (
      viewMode === "edit" &&
      profileName !== editingProfile?.profile.name &&
      existingNames.has(profileName)
    ) {
      return false;
    }
    return true;
  }, [profileName, viewMode, existingNames, editingProfile?.profile.name]);

  const handleAddProfile = useCallback(() => {
    setProfileName("");
    setEditingProfile(null);
    setViewMode("create");
  }, []);

  const handleEditProfile = useCallback(
    async (profile: ProfileInfo) => {
      try {
        // Fetch profile details with encrypted secrets to preserve API key
        const detail = await ProfilesService.getProfile(
          profile.name,
          "encrypted",
        );

        // Profile config contains llm settings directly at the top level
        // The structure is: { model, api_key, base_url, ... }
        // (NOT nested under a "llm" key)
        const config = (detail.config ?? {}) as Record<string, unknown>;

        // Seed every llm.* form field from the profile config so all tabs —
        // including "All" — reflect the profile's real values rather than the
        // active settings. Fields absent from the schema are still preserved
        // on save via `baseConfig`. Read the schema from the ref so a schema
        // that loaded during the `getProfile` await above is used.
        const schema = agentSchemaRef.current;
        const llmFields =
          schema?.sections.find((section) => section.key === "llm")?.fields ??
          [];
        const initialValues: SettingsFormValues = {};
        for (const field of llmFields) {
          const flatKey = field.key.startsWith("llm.")
            ? field.key.slice("llm.".length)
            : field.key;
          initialValues[field.key] = normalizeFieldValue(
            field,
            config[flatKey],
          );
        }

        // Safety net for the specially-rendered keys when the schema is
        // unavailable, so editing still works without it.
        if (llmFields.length === 0) {
          initialValues["llm.model"] = (config.model as string) ?? "";
          initialValues["llm.api_key"] = (config.api_key as string) ?? "";
          initialValues["llm.base_url"] = (config.base_url as string) ?? "";
        }

        setEditingProfile({ profile, initialValues, baseConfig: config });
        setProfileName(profile.name);
        setViewMode("edit");
      } catch (error) {
        console.error("Failed to fetch profile details:", error);
        displayErrorToast(t(I18nKey.ERROR$GENERIC));
      }
    },
    [t],
  );

  const handleBackToList = useCallback(() => {
    setViewMode("list");
    setEditingProfile(null);
    setProfileName("");
    setSaveControl(null);
    setVerifyState({ status: "idle" });
    setIsVerifying(false);
  }, []);

  const handleSaveControlChange = useCallback(
    (control: SdkSectionSaveControl) => {
      setSaveControl(control);

      // Auto-derive profile name from model in create mode.
      // Note: The uniqueness check uses existingNames from state, which is derived
      // from profilesData at component render time. If another client creates a
      // profile with the same derived name while this form is open, the client-side
      // check would pass but the server save would fail with a conflict error.
      // This is acceptable for the current use case; the server error is handled
      // gracefully in handleSave.
      if (viewMode === "create" && !profileName) {
        const modelValue = control.values["llm.model"];
        if (typeof modelValue === "string" && modelValue) {
          const derived = deriveProfileNameFromModel(modelValue);
          if (!existingNames.has(derived)) {
            setProfileName(derived);
          }
        }
      }
    },
    [viewMode, profileName, existingNames],
  );

  /** Run the actual profile-save logic after credentials have been verified. */
  const doSaveProfile = useCallback(async () => {
    if (!saveControl || !isNameValid) return;

    // Coerced, dirty-only changes from the embedded form. Merging these over
    // the profile's existing full config preserves fields the user did not
    // touch (incl. ones hidden in the current tab or absent from the schema);
    // the backend replaces the whole LLM object, so a partial payload would
    // otherwise reset everything else to defaults.
    let dirtyLlm: Record<string, unknown>;
    try {
      dirtyLlm = (saveControl.getDirtyPayload().llm ?? {}) as Record<
        string,
        unknown
      >;
    } catch (error) {
      displayErrorToast(
        error instanceof Error ? error.message : t(I18nKey.ERROR$GENERIC),
      );
      return;
    }

    const baseConfig =
      viewMode === "edit" && editingProfile?.baseConfig
        ? { ...editingProfile.baseConfig }
        : {};
    const llmConfig: Record<string, unknown> = { ...baseConfig, ...dirtyLlm };

    // The Basic tab has no base_url field; the provider implies it. Drop any
    // (possibly stale, non-proxy) base_url so the backend derives the correct
    // one — e.g. the All-Hands proxy for openhands/* models, which is required
    // for the provider to round-trip back to "OpenHands" on reload. Mirrors
    // LlmSettingsScreen.buildPayload's Basic-view reset.
    if (saveControl.view === "basic") {
      delete llmConfig.base_url;
    }

    // API key handling: an empty value means "no change" (the UX doesn't
    // support clearing a key). In edit mode preserve the existing encrypted
    // key from the profile; in create mode omit api_key entirely. A newly
    // typed key arrives in `dirtyLlm` and wins.
    if (
      typeof llmConfig.api_key !== "string" ||
      llmConfig.api_key.trim() === ""
    ) {
      const existingKey =
        typeof baseConfig.api_key === "string" ? baseConfig.api_key : "";
      if (existingKey) {
        llmConfig.api_key = existingKey;
      } else {
        delete llmConfig.api_key;
      }
    }

    const model = typeof llmConfig.model === "string" ? llmConfig.model : "";
    if (!model) {
      displayErrorToast(t(I18nKey.SETTINGS$MODEL_REQUIRED));
      return;
    }

    const trimmedName = profileName.trim();
    const originalName = editingProfile?.profile.name;
    const isRename =
      viewMode === "edit" && originalName && originalName !== trimmedName;
    const shouldReapplyActiveProfile = shouldReapplyProfileAfterSave({
      activeProfileName: profilesData?.active_profile,
      originalName,
      savedName: trimmedName,
    });

    setIsSaving(true);
    try {
      // If editing and name changed, rename the profile first
      if (isRename) {
        await ProfilesService.renameProfile(originalName, trimmedName);
      }

      await saveProfile.mutateAsync({
        name: trimmedName,
        request: {
          llm: llmConfig as {
            model: string;
            api_key?: string;
            base_url?: string;
          },
          include_secrets: true,
        },
      });

      // Conversation start uses agent_settings.llm, not the profile row
      // directly. Re-applying an active profile keeps those settings in sync
      // after editing or recreating a profile with the active profile name.
      if (shouldReapplyActiveProfile) {
        await activateProfile.mutateAsync(trimmedName);
      }

      displaySuccessToast(
        viewMode === "create"
          ? t(I18nKey.SETTINGS$PROFILE_CREATED, { name: trimmedName })
          : t(I18nKey.SETTINGS$PROFILE_UPDATED, { name: trimmedName }),
      );
      handleBackToList();
    } catch (error) {
      console.error("Failed to save profile:", error);
      displayErrorToast(t(I18nKey.ERROR$GENERIC));
    } finally {
      setIsSaving(false);
    }
  }, [
    saveControl,
    isNameValid,
    profileName,
    viewMode,
    editingProfile,
    profilesData?.active_profile,
    saveProfile,
    activateProfile,
    t,
    handleBackToList,
  ]);

  /** Verify credentials then save the profile. */
  const handleSave = useCallback(async () => {
    if (!saveControl || !isNameValid || isVerifying || isSaving) return;

    const model =
      typeof saveControl.values["llm.model"] === "string"
        ? saveControl.values["llm.model"]
        : "";
    const apiKey =
      typeof saveControl.values["llm.api_key"] === "string"
        ? saveControl.values["llm.api_key"]
        : "";
    const baseUrl =
      typeof saveControl.values["llm.base_url"] === "string"
        ? saveControl.values["llm.base_url"]
        : "";

    setIsVerifying(true);
    setVerifyState({ status: "verifying" });

    try {
      const result = await verifyLlmConfig(model, apiKey, baseUrl || undefined);

      if (result.status === "auth_error") {
        setVerifyState({ status: "auth_error", message: result.message });
        return;
      }

      if (result.status === "network_error") {
        setVerifyState({ status: "network_error" });
        return;
      }

      // success or unsupported → proceed with save
      setVerifyState({ status: "idle" });
      await doSaveProfile();
    } finally {
      setIsVerifying(false);
    }
  }, [saveControl, isNameValid, isVerifying, isSaving, doSaveProfile]);

  /** Skip verification and save immediately (after a network_error warning). */
  const handleSaveAnyway = useCallback(async () => {
    setVerifyState({ status: "idle" });
    await doSaveProfile();
  }, [doSaveProfile]);

  // List view: show profiles manager
  if (viewMode === "list") {
    return (
      <LlmProfilesManager
        onAddProfile={handleAddProfile}
        onEditProfile={handleEditProfile}
      />
    );
  }

  const profileEditorTitle =
    viewMode === "edit"
      ? t(I18nKey.SETTINGS$EDIT_LLM_PROFILE)
      : t(I18nKey.SETTINGS$ADD_LLM_PROFILE);
  const profileEditorDescription =
    viewMode === "edit" && editingProfile
      ? t(I18nKey.SETTINGS$PROFILE_LOADED, {
          name: editingProfile.profile.name,
        })
      : t(I18nKey.SETTINGS$PROFILE_SAVE_HINT);

  // Create/Edit view: show form with profile name input
  return (
    <div className="flex flex-col gap-6">
      {/* Header with back button */}
      <div className="flex flex-col gap-2">
        <BackNavButton testId="back-to-profiles" onClick={handleBackToList}>
          {t(I18nKey.BUTTON$BACK)}
        </BackNavButton>
        <Typography.H2 testId="profile-editor-title">
          {profileEditorTitle}
        </Typography.H2>
        <p
          data-testid="profile-editor-description"
          className="text-sm leading-5 text-tertiary-light"
        >
          {profileEditorDescription}
        </p>
      </div>

      {/* Profile name input */}
      <ProfileNameInput
        testId="profile-name-input"
        value={profileName}
        onChange={setProfileName}
        isRequired
      />

      {/* Profile form - key ensures form remounts when switching profiles */}
      <LlmSettingsScreen
        key={
          viewMode === "edit"
            ? `edit-${editingProfile?.profile.name}`
            : "new-profile"
        }
        embedded
        hideSaveButton
        initialValueOverrides={
          viewMode === "edit" && editingProfile?.initialValues
            ? // Edit mode: use the existing profile values
              editingProfile.initialValues
            : // Create mode: start with empty fields for a fresh profile
              { "llm.model": "", "llm.api_key": "", "llm.base_url": "" }
        }
        onSaveControlChange={handleSaveControlChange}
      />

      <LlmConnectionStatus
        state={verifyState}
        onSaveAnyway={handleSaveAnyway}
      />

      {/* Action buttons */}
      <div className="flex justify-start gap-3 pt-4">
        <BrandButton
          testId="cancel-profile-btn"
          type="button"
          variant="secondary"
          onClick={handleBackToList}
        >
          {t(I18nKey.BUTTON$CANCEL)}
        </BrandButton>
        <BrandButton
          testId="save-profile-btn"
          type="button"
          variant="primary"
          onClick={handleSave}
          isDisabled={!isNameValid || isSaving || isVerifying || !saveControl}
          aria-busy={isSaving || isVerifying}
        >
          {isVerifying
            ? t(I18nKey.LLM_VERIFY$TESTING)
            : isSaving
              ? t(I18nKey.STATUS$SAVING)
              : t(I18nKey.BUTTON$SAVE)}
        </BrandButton>
      </div>
    </div>
  );
}
