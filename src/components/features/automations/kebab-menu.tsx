import { useState, useEffect, useRef } from "react";
import KebabVerticalIcon from "#/icons/kebab-vertical.svg?react";

export interface KebabMenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
}

interface KebabMenuProps {
  items: KebabMenuItem[];
}

export function KebabMenu({ items }: KebabMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex size-8 cursor-pointer items-center justify-center rounded border border-[var(--oh-border)] bg-surface hover:bg-surface-raised"
        aria-label="Automation actions"
      >
        <KebabVerticalIcon className="size-4 text-muted" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-[var(--oh-border)] bg-surface-raised py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
                setOpen(false);
              }}
              className={`flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-sm hover:bg-surface-raised ${
                item.variant === "danger" ? "text-danger" : "text-white"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
