import type { ReactNode } from "react";

export interface DropdownOption {
  value: string;
  /** Searchable value and combobox input text (may include org qualifier). */
  label: string;
  /**
   * Primary marquee text when {@link suffix} carries the org qualifier
   * (cloud org rows show the backend name plus an org pill).
   */
  displayLabel?: string;
  /**
   * Optional content rendered after the label in both the trigger
   * (when this option is selected) and each menu row. Not searchable.
   */
  suffix?: ReactNode;
  /**
   * Optional content rendered before the label in both the trigger
   * (when this option is selected) and each menu row. Used for things
   * like status indicators; not searchable.
   */
  prefix?: ReactNode;
}
