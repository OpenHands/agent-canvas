import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import SearchIcon from "#/icons/search.svg?react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchInput({ value, onChange }: SearchInputProps) {
  const { t } = useTranslation("openhands");

  return (
    <div className="relative">
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(I18nKey.AUTOMATIONS$SEARCH_PLACEHOLDER)}
        className="w-full max-w-sm rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] py-2 pl-10 pr-3 text-sm text-white placeholder:text-muted focus:border-[var(--oh-border)] focus:outline-none"
      />
    </div>
  );
}
