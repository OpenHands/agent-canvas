import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandButton } from "#/components/features/settings/brand-button";
import { AgentProfilesBody } from "./agent-profiles-body";
import { AgentProfileEditor } from "./agent-profile-editor";
import { CreateAgentProfileModal } from "./create-agent-profile-modal";
import { RenameAgentProfileModal } from "./rename-agent-profile-modal";
import { DeleteAgentProfileModal } from "./delete-agent-profile-modal";
import type { AgentKind } from "./editor/use-agent-profile-form";
import AgentProfilesService, {
  type AgentProfile,
  type AgentProfileSummary,
  type AgentProfileSaveInput,
} from "#/api/agent-profiles-service/agent-profiles-service.api";
import { useAgentProfiles } from "#/hooks/query/use-agent-profiles";
import { useActivateAgentProfile } from "#/hooks/mutation/use-activate-agent-profile";
import { useSaveAgentProfile } from "#/hooks/mutation/use-save-agent-profile";
import { useSettingsSectionHeader } from "#/contexts/settings-section-header-context";
import { isSdkHttpStatusError } from "#/api/agent-server-compatibility";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";

type ViewMode = "list" | "create" | "edit";

/** Project a fetched profile to a save body, dropping server-managed identity
 * (id/revision/schema_version/name) so a save under a new name mints a fresh id
 * (used by Duplicate). */
function toSaveInput(profile: AgentProfile): AgentProfileSaveInput {
  if (profile.agent_kind === "acp") {
    return {
      agent_kind: "acp",
      acp_server: profile.acp_server,
      acp_model: profile.acp_model,
      acp_session_mode: profile.acp_session_mode,
      acp_prompt_timeout: profile.acp_prompt_timeout,
      acp_command: profile.acp_command,
      acp_args: profile.acp_args,
      mcp_server_refs: profile.mcp_server_refs,
    };
  }
  return {
    agent_kind: "openhands",
    llm_profile_ref: profile.llm_profile_ref,
    agent: profile.agent,
    skills: profile.skills,
    system_message_suffix: profile.system_message_suffix,
    condenser: profile.condenser,
    verification: profile.verification,
    enable_sub_agents: profile.enable_sub_agents,
    tool_concurrency_limit: profile.tool_concurrency_limit,
    mcp_server_refs: profile.mcp_server_refs,
  };
}

export function AgentProfilesManager() {
  const { t } = useTranslation("openhands");
  const { setHideSectionHeader } = useSettingsSectionHeader();
  const { data, isLoading, error } = useAgentProfiles();
  const activateProfile = useActivateAgentProfile();
  const saveProfile = useSaveAgentProfile();

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createKind, setCreateKind] = useState<AgentKind>("openhands");
  const [editingProfile, setEditingProfile] = useState<AgentProfile | null>(
    null,
  );
  const [profileToRename, setProfileToRename] =
    useState<AgentProfileSummary | null>(null);
  const [profileToDelete, setProfileToDelete] =
    useState<AgentProfileSummary | null>(null);

  const profiles = data?.profiles ?? [];
  const activeId = data?.active_agent_profile_id ?? null;
  const existingNames = useMemo(() => profiles.map((p) => p.name), [profiles]);

  // Collapse the page's section header while the editor is open (mirrors the
  // LLM profiles local view) so the editor owns the heading.
  useEffect(() => {
    setHideSectionHeader(viewMode !== "list");
    return () => setHideSectionHeader(false);
  }, [viewMode, setHideSectionHeader]);

  const handleActivate = useCallback(
    async (profile: AgentProfileSummary) => {
      if (!profile.id) return;
      try {
        await activateProfile.mutateAsync(profile.id);
        displaySuccessToast(
          t(I18nKey.SETTINGS$PROFILE_ACTIVATED, { name: profile.name }),
        );
      } catch {
        displayErrorToast(t(I18nKey.ERROR$GENERIC));
      }
    },
    [activateProfile, t],
  );

  const handleAdd = useCallback(() => {
    setIsCreateModalOpen(true);
  }, []);

  const handleSelectKind = useCallback((kind: AgentKind) => {
    setCreateKind(kind);
    setEditingProfile(null);
    setIsCreateModalOpen(false);
    setViewMode("create");
  }, []);

  const handleEdit = useCallback(
    async (profile: AgentProfileSummary) => {
      try {
        // Fetch the full profile with encrypted skill secrets so any
        // skills[].mcp_tools secrets round-trip safely on save.
        const detail = await AgentProfilesService.getProfile(
          profile.name,
          "encrypted",
        );
        setEditingProfile(detail.profile);
        setViewMode("edit");
      } catch {
        displayErrorToast(t(I18nKey.ERROR$GENERIC));
      }
    },
    [t],
  );

  const handleDuplicate = useCallback(
    async (profile: AgentProfileSummary) => {
      try {
        const detail = await AgentProfilesService.getProfile(
          profile.name,
          "encrypted",
        );
        const existing = new Set(existingNames);
        // Cap at the 64-char profile-name limit: truncate the base so the
        // "-copy" suffix always fits (a longer name would 422 server-side).
        const MAX_NAME = 64;
        const copyName = (suffix: string) =>
          `${profile.name.slice(0, MAX_NAME - suffix.length)}${suffix}`;
        let newName = copyName("-copy");
        let counter = 1;
        while (existing.has(newName)) {
          newName = copyName(`-copy-${counter}`);
          counter += 1;
        }
        await saveProfile.mutateAsync({
          name: newName,
          profile: toSaveInput(detail.profile),
        });
        displaySuccessToast(
          t(I18nKey.SETTINGS$PROFILE_DUPLICATED, { name: newName }),
        );
      } catch (err) {
        displayErrorToast(
          isSdkHttpStatusError(err, 409)
            ? t(I18nKey.SETTINGS$AGENT_PROFILE_LIMIT_REACHED)
            : t(I18nKey.ERROR$GENERIC),
        );
      }
    },
    [existingNames, saveProfile, t],
  );

  const handleBackToList = useCallback(() => {
    setViewMode("list");
    setEditingProfile(null);
  }, []);

  if (viewMode !== "list") {
    return (
      <AgentProfileEditor
        key={editingProfile?.id ?? `new-${createKind}`}
        mode={viewMode}
        profile={editingProfile}
        createKind={createKind}
        existingNames={existingNames}
        activeId={activeId}
        onCancel={handleBackToList}
        onSaved={handleBackToList}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium text-white">
            {t(I18nKey.SETTINGS$AVAILABLE_PROFILES)}
          </h2>
          <BrandButton
            testId="add-agent-profile"
            type="button"
            variant="secondary"
            className="ml-auto"
            onClick={handleAdd}
          >
            {t(I18nKey.SETTINGS$ADD_AGENT_PROFILE)}
          </BrandButton>
        </div>

        <AgentProfilesBody
          isLoading={isLoading}
          loadError={error ?? null}
          profiles={profiles}
          activeId={activeId}
          onActivate={handleActivate}
          onEdit={handleEdit}
          onRename={setProfileToRename}
          onDuplicate={handleDuplicate}
          onDelete={setProfileToDelete}
          isActivating={activateProfile.isPending}
        />
      </div>

      <CreateAgentProfileModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSelect={handleSelectKind}
      />
      <RenameAgentProfileModal
        profile={profileToRename}
        onClose={() => setProfileToRename(null)}
      />
      <DeleteAgentProfileModal
        profile={profileToDelete}
        onClose={() => setProfileToDelete(null)}
      />
    </>
  );
}
