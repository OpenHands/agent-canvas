import { I18nKey } from "#/i18n/declaration";
import { EnumFilterDropdown } from "#/components/shared/filters/enum-filter-dropdown";
import {
  SKILL_SCOPE_FILTER_OPTIONS,
  SKILL_STATUS_FILTER_OPTIONS,
  type SkillScopeFilter,
  type SkillStatusFilter,
} from "./skill-type-filter";

// --- Scope dropdown ---

const SCOPE_LABEL_KEY: Record<SkillScopeFilter, I18nKey> = {
  all: I18nKey.SETTINGS$SKILLS_TYPE_ALL,
  bundled: I18nKey.SETTINGS$SKILLS_SCOPE_BUNDLED,
  personal: I18nKey.SETTINGS$SKILLS_SCOPE_PERSONAL,
};

interface SkillsScopeFilterDropdownProps {
  value: SkillScopeFilter;
  onChange: (filter: SkillScopeFilter) => void;
}

export function SkillsScopeFilterDropdown({
  value,
  onChange,
}: SkillsScopeFilterDropdownProps) {
  return (
    <EnumFilterDropdown
      testId="skills-scope-filter"
      value={value}
      onChange={onChange}
      options={SKILL_SCOPE_FILTER_OPTIONS}
      labelKeyByValue={SCOPE_LABEL_KEY}
    />
  );
}

// --- Status dropdown ---

const STATUS_LABEL_KEY: Record<SkillStatusFilter, I18nKey> = {
  all: I18nKey.SETTINGS$SKILLS_TYPE_ALL,
  enabled: I18nKey.SETTINGS$SKILLS_ENABLED,
  disabled: I18nKey.SETTINGS$SKILLS_DISABLED,
};

interface SkillsStatusFilterDropdownProps {
  value: SkillStatusFilter;
  onChange: (filter: SkillStatusFilter) => void;
}

export function SkillsStatusFilterDropdown({
  value,
  onChange,
}: SkillsStatusFilterDropdownProps) {
  return (
    <EnumFilterDropdown
      testId="skills-status-filter"
      value={value}
      onChange={onChange}
      options={SKILL_STATUS_FILTER_OPTIONS}
      labelKeyByValue={STATUS_LABEL_KEY}
    />
  );
}
