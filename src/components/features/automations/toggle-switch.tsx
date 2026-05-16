interface ToggleSwitchProps {
  enabled: boolean;
  label: string;
  onToggle: () => void;
}

export function ToggleSwitch({ enabled, label, onToggle }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
        enabled
          ? "border-[var(--oh-success)] bg-[var(--oh-success)]/15"
          : "border-[var(--oh-border)] bg-surface-raised"
      }`}
    >
      <span
        className={`inline-block size-4 rounded-full transition-transform ${
          enabled
            ? "translate-x-[20px] bg-[var(--oh-success)]"
            : "translate-x-[3px] bg-[var(--oh-muted)]"
        }`}
      />
    </button>
  );
}
