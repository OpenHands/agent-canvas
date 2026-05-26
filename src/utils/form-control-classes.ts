import { cn } from "#/utils/utils";

/** 36px control height — shared by fields, dropdowns, and buttons. */
export const formControlHeightClassName = "h-9 min-h-9";

export const formControlRadiusClassName = "rounded-lg";

export const formControlBorderClassName = "border border-[var(--oh-border)]";

export const formControlSurfaceClassName = "bg-base-secondary";

/** Animate shell chrome on hover/focus; foreground color snaps instantly. */
export const formControlTransitionClassName =
  "transition-[background-color,border-color,box-shadow,opacity] duration-150 motion-reduce:transition-none";

/** HeroUI input wrappers ship `transition-colors`; override so caret/text hover is instant. */
export const formControlHeroUiWrapperTransitionClassName =
  "!transition-[background-color,border-color,box-shadow,opacity] !duration-150 motion-reduce:transition-none";

export const formControlFocusClassName =
  "focus:border-white/40 focus:ring-1 focus:ring-white/20 focus:outline-none";

export const formControlFocusWithinClassName =
  "focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/20";

export const formControlDisabledClassName =
  "disabled:cursor-not-allowed disabled:opacity-60";

/** Native text inputs and HeroUI Autocomplete wrappers. */
export const formControlFieldClassName = cn(
  formControlHeightClassName,
  formControlRadiusClassName,
  formControlBorderClassName,
  formControlSurfaceClassName,
  formControlTransitionClassName,
  formControlFocusClassName,
  formControlDisabledClassName,
  "w-full min-w-0 px-3 text-sm text-white placeholder:text-tertiary-alt",
);

/** Settings screens keep italic placeholders on form controls. */
export const formControlSettingsFieldClassName = cn(
  formControlFieldClassName,
  "placeholder:italic",
  formControlHeroUiWrapperTransitionClassName,
);

/** Multiline fields share border/radius/focus styling without a fixed height. */
export const formControlMultilineFieldClassName = cn(
  formControlRadiusClassName,
  formControlBorderClassName,
  formControlSurfaceClassName,
  formControlTransitionClassName,
  formControlFocusClassName,
  formControlDisabledClassName,
  "w-full min-w-0 px-3 py-2 text-sm text-white placeholder:text-tertiary-alt",
);

/** Combobox / search shell (icon + input), e.g. skills toolbar. */
export const formControlShellClassName = cn(
  formControlHeightClassName,
  "relative flex min-w-0 items-center",
  formControlRadiusClassName,
  formControlBorderClassName,
  formControlSurfaceClassName,
  formControlTransitionClassName,
  formControlFocusWithinClassName,
);

/** Borderless input nested inside {@link formControlShellClassName}. */
export const formControlInlineInputClassName = cn(
  "min-w-0 flex-1 border-0 bg-transparent px-3 text-sm outline-none",
  "placeholder:text-tertiary-alt",
  "[&::-webkit-search-cancel-button]:hidden",
);

/** Primary/secondary/danger action buttons. */
export const formControlButtonClassName = cn(
  formControlHeightClassName,
  "inline-flex w-fit cursor-pointer items-center justify-center gap-2 px-3",
  formControlRadiusClassName,
  formControlTransitionClassName,
  "text-sm font-normal disabled:cursor-not-allowed disabled:opacity-30",
);

/** Helper text under a left-aligned {@link SettingsSwitch} (40px track + gap-2). */
export const formControlSwitchDescriptionClassName = "pl-12";

/** Filter / enum dropdown triggers beside search toolbars. */
export const formControlFilterTriggerClassName = cn(
  formControlButtonClassName,
  formControlBorderClassName,
  formControlSurfaceClassName,
  "shrink-0 text-white",
);
