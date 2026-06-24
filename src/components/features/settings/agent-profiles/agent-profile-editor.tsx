import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentProfile } from "@openhands/typescript-client";
import { BrandButton } from "#/components/features/settings/brand-button";
import { BackNavButton } from "#/components/shared/buttons/back-nav-button";
import { Typography } from "#/ui/typography";
import { useActivateAgentProfile } from "#/hooks/mutation/use-activate-agent-profile";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { I18nKey } from "#/i18n/declaration";
import {
  useAgentProfileForm,
  type AgentKind,
} from "./editor/use-agent-profile-form";
import { getSectionsForKind, type SectionId } from "./editor/sections";
import { AgentProfileSectionNav } from "./editor/agent-profile-section-nav";
import { AgentProfileOverview } from "./editor/agent-profile-overview";
import { GeneralSection } from "./editor/sections/general-section";
import {
  ModelSection,
  ToolsMcpSection,
  CondenserSection,
} from "./editor/sections/openhands-sections";
import {
  ProviderModelSection,
  LaunchSection,
  McpSection,
  AuthenticationSection,
} from "./editor/sections/acp-sections";

interface AgentProfileEditorProps {
  mode: "create" | "edit";
  /** Full profile to edit (already fetched). Null in create mode. */
  profile: AgentProfile | null;
  /** Kind chosen in the create modal (create mode only). */
  createKind?: AgentKind;
  /** Existing names for duplicate validation. */
  existingNames: string[];
  /** Active (default) profile id, for the "Set default" control. */
  activeId?: string | null;
  onCancel: () => void;
  onSaved: () => void;
}

export function AgentProfileEditor({
  mode,
  profile,
  createKind = "openhands",
  existingNames,
  activeId,
  onCancel,
  onSaved,
}: AgentProfileEditorProps) {
  const { t } = useTranslation("openhands");
  const activate = useActivateAgentProfile();
  const form = useAgentProfileForm({
    mode,
    profile,
    createKind,
    existingNames,
    onSaved,
  });

  const sections = useMemo(
    () => getSectionsForKind(form.agentKind),
    [form.agentKind],
  );
  const [activeSection, setActiveSection] = useState<SectionId>(
    mode === "edit" ? "overview" : "general",
  );

  const errorSections = useMemo(() => {
    const s = new Set<SectionId>();
    if (!form.isNameValid) s.add("general");
    if (!form.isAcp && !form.isLlmRefValid) s.add("model");
    if (form.isAcp && form.isAcpInvalid) s.add("launch");
    return s;
  }, [form.isNameValid, form.isLlmRefValid, form.isAcpInvalid, form.isAcp]);

  const isActive = mode === "edit" && !!profile?.id && profile.id === activeId;
  const canSetDefault = mode === "edit" && !!profile?.id && !isActive;

  const handleSetDefault = async () => {
    if (!profile?.id) return;
    try {
      await activate.mutateAsync(profile.id);
      displaySuccessToast(
        t(I18nKey.SETTINGS$PROFILE_ACTIVATED, { name: profile.name }),
      );
    } catch {
      displayErrorToast(t(I18nKey.ERROR$GENERIC));
    }
  };

  const renderSection = () => {
    switch (activeSection) {
      case "overview":
        return (
          <AgentProfileOverview
            form={form}
            profileName={profile?.name ?? null}
          />
        );
      case "general":
        return <GeneralSection form={form} />;
      // OpenHands
      case "model":
        return <ModelSection form={form} />;
      case "tools-mcp":
        return <ToolsMcpSection form={form} />;
      case "condenser":
        return <CondenserSection form={form} />;
      // ACP
      case "provider-model":
        return <ProviderModelSection form={form} />;
      case "launch":
        return <LaunchSection form={form} />;
      case "mcp":
        return <McpSection form={form} />;
      case "authentication":
        return <AuthenticationSection form={form} />;
      default:
        return null;
    }
  };

  const kindLabel = form.isAcp
    ? t(I18nKey.SETTINGS$AGENT_TYPE_ACP)
    : t(I18nKey.SETTINGS$AGENT_TYPE_OPENHANDS);

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="flex flex-col gap-2">
        <BackNavButton testId="back-to-agent-profiles" onClick={onCancel}>
          {t(I18nKey.BUTTON$BACK)}
        </BackNavButton>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Typography.H2 testId="agent-profile-editor-title">
              {form.name.trim() ||
                (mode === "create"
                  ? t(I18nKey.SETTINGS$ADD_AGENT_PROFILE)
                  : t(I18nKey.SETTINGS$EDIT_AGENT_PROFILE))}
            </Typography.H2>
            <span className="rounded-full bg-tertiary px-2 py-0.5 text-xs text-[#A3A3A3]">
              {kindLabel}
            </span>
            {isActive && (
              <span
                data-testid="agent-profile-default-badge"
                className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary"
              >
                {t(I18nKey.SETTINGS$PROFILE_ACTIVE)}
              </span>
            )}
          </div>
          {canSetDefault && (
            <BrandButton
              testId="set-default-agent-profile-btn"
              type="button"
              variant="secondary"
              onClick={handleSetDefault}
              isDisabled={activate.isPending}
            >
              {t(I18nKey.SETTINGS$SET_AS_DEFAULT)}
            </BrandButton>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <AgentProfileSectionNav
          sections={sections}
          activeId={activeSection}
          onSelect={setActiveSection}
          errorSections={errorSections}
        />
        <div className="min-w-0 flex-1 max-w-2xl">{renderSection()}</div>
      </div>

      <div className="flex justify-start gap-3 border-t border-[#3D4046] pt-4">
        <BrandButton
          testId="cancel-agent-profile-btn"
          type="button"
          variant="secondary"
          onClick={onCancel}
          isDisabled={form.isSaving}
        >
          {t(I18nKey.BUTTON$CANCEL)}
        </BrandButton>
        <BrandButton
          testId="save-agent-profile-btn"
          type="button"
          variant="primary"
          onClick={form.handleSave}
          isDisabled={!form.canSave || form.isSaving}
          aria-busy={form.isSaving}
        >
          {form.isSaving ? t(I18nKey.SETTINGS$SAVING) : t(I18nKey.BUTTON$SAVE)}
        </BrandButton>
      </div>
    </div>
  );
}
