import React, { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LlmProfilesManager } from "./llm-profiles-manager";
import { ProfileNameInput } from "./profile-name-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { LlmSettingsScreen } from "#/routes/llm-settings";
import { useSaveLlmProfile } from "#/hooks/mutation/use-save-llm-profile";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
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
import { SettingsFormValues } from "#/utils/sdk-settings-schema";
import { ArrowLeft } from "lucide-react";

type ViewMode = "list" | "create" | "edit";

interface EditingProfile {
  profile: ProfileInfo;
  initialValues: SettingsFormValues;
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
  const saveProfile = useSaveLlmProfile();
  const { data: profilesData } = useLlmProfiles();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [profileName, setProfileName] = useState("");
  const [editingProfile, setEditingProfile] = useState<EditingProfile | null>(
    null,
  );
  const [saveControl, setSaveControl] = useState<SdkSectionSaveControl | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

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

        const initialValues: SettingsFormValues = {
          "llm.model": (config.model as string) ?? "",
          "llm.api_key": (config.api_key as string) ?? "",
          "llm.base_url": (config.base_url as string) ?? "",
        };

        setEditingProfile({ profile, initialValues });
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

  const handleSave = useCallback(async () => {
    if (!saveControl || !isNameValid) return;

    const values = saveControl.values;
    const model =
      typeof values["llm.model"] === "string" ? values["llm.model"] : "";
    const apiKey =
      typeof values["llm.api_key"] === "string" ? values["llm.api_key"] : "";
    const baseUrl =
      typeof values["llm.base_url"] === "string" ? values["llm.base_url"] : "";

    if (!model) {
      displayErrorToast(t(I18nKey.SETTINGS$MODEL_REQUIRED));
      return;
    }

    const trimmedName = profileName.trim();
    const originalName = editingProfile?.profile.name;
    const isRename =
      viewMode === "edit" && originalName && originalName !== trimmedName;
    const wasActive = profilesData?.active_profile === originalName;

    setIsSaving(true);
    try {
      // If editing and name changed, rename the profile first
      if (isRename) {
        await ProfilesService.renameProfile(originalName, trimmedName);
      }

      // Build the LLM config object
      const llmConfig: Record<string, unknown> = { model };

      // API key handling:
      // - If user entered a new key, use it
      // - In edit mode with no new key, preserve the existing encrypted key
      //   (fetched with exposeSecrets='encrypted' and passed back to server)
      // - In create mode with no key, omit api_key entirely
      //
      // Note: The current UX doesn't support explicitly clearing an API key.
      // If needed, a future enhancement could add a "Clear API Key" option.
      // The encrypted key format is stable and can be round-tripped to the server.
      if (apiKey) {
        llmConfig.api_key = apiKey;
      } else if (
        viewMode === "edit" &&
        editingProfile?.initialValues["llm.api_key"]
      ) {
        llmConfig.api_key = editingProfile.initialValues["llm.api_key"];
      }

      // Only include base_url if set
      if (baseUrl) {
        llmConfig.base_url = baseUrl;
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

      // If the renamed profile was the active profile, re-activate it
      // (the rename operation doesn't automatically update active_profile)
      if (isRename && wasActive) {
        await ProfilesService.activateProfile(trimmedName);
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
    t,
    handleBackToList,
  ]);

  // List view: show profiles manager
  if (viewMode === "list") {
    return (
      <LlmProfilesManager
        onAddProfile={handleAddProfile}
        onEditProfile={handleEditProfile}
      />
    );
  }

  // Create/Edit view: show form with profile name input
  return (
    <div className="flex flex-col gap-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBackToList}
          className="p-2 rounded-lg hover:bg-tertiary text-neutral-400 hover:text-white transition-colors"
          aria-label={t(I18nKey.BUTTON$BACK)}
          data-testid="back-to-profiles"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-base font-semibold text-white">
          {t(I18nKey.SETTINGS$BACK_TO_LLM_PROFILES_LIST)}
        </h2>
      </div>

      {/* Profile name input */}
      <ProfileNameInput
        testId="profile-name-input"
        value={profileName}
        onChange={setProfileName}
        isRequired
      />

      {/* LLM Settings Form - key ensures form remounts when switching profiles */}
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

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t border-tertiary">
        <BrandButton
          testId="cancel-profile-btn"
          type="button"
          variant="tertiary"
          onClick={handleBackToList}
        >
          {t(I18nKey.BUTTON$CANCEL)}
        </BrandButton>
        <BrandButton
          testId="save-profile-btn"
          type="button"
          variant="primary"
          onClick={handleSave}
          isDisabled={!isNameValid || isSaving || !saveControl}
          aria-busy={isSaving}
        >
          {isSaving ? t(I18nKey.STATUS$SAVING) : t(I18nKey.BUTTON$SAVE)}
        </BrandButton>
      </div>
    </div>
  );
}
