import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  formControlInlineInputClassName,
  formControlShellClassName,
} from "#/utils/form-control-classes";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SearchInput({ value, onChange, className }: SearchInputProps) {
  const { t } = useTranslation("openhands");

  return (
    <div className={cn(formControlShellClassName, "w-full", className)}>
      <Search className="ml-3 h-4 w-4 shrink-0 text-tertiary-alt" aria-hidden />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(I18nKey.AUTOMATIONS$SEARCH_PLACEHOLDER)}
        aria-label={t(I18nKey.AUTOMATIONS$SEARCH_PLACEHOLDER)}
        className={formControlInlineInputClassName}
      />
    </div>
  );
}
