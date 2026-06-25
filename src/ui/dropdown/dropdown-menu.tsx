import React from "react";
import { Divider } from "#/ui/divider";
import { cn } from "#/utils/utils";
import { DropdownOption } from "./types";
import {
  dropdownMenuListClassName,
  dropdownMenuRowClassName,
  dropdownMenuRowIconWrapperClassName,
} from "#/utils/dropdown-classes";
import { DropdownOptionLabel } from "./dropdown-option-label";
import {
  computeDropdownMenuLayout,
  type DropdownMenuLayout,
} from "./dropdown-menu-layout";

interface DropdownMenuProps {
  isOpen: boolean;
  filteredOptions: DropdownOption[];
  selectedItem: DropdownOption | null;
  emptyMessage: string;
  getMenuProps: (props?: object) => object;
  getItemProps: (props: {
    item: DropdownOption;
    index: number;
    className?: string;
  }) => object;
  footer?: React.ReactNode;
  openUpward?: boolean;
  fitContent?: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const EMPTY_LAYOUT: DropdownMenuLayout = {
  needsScroll: false,
  maxHeightPx: undefined,
};

export function DropdownMenu({
  isOpen,
  filteredOptions,
  selectedItem,
  emptyMessage,
  getMenuProps,
  getItemProps,
  footer,
  openUpward = false,
  fitContent = false,
  anchorRef,
}: DropdownMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [layout, setLayout] = React.useState<DropdownMenuLayout>(EMPTY_LAYOUT);

  const measureLayout = React.useCallback(() => {
    const menu = menuRef.current;
    const anchor = anchorRef.current;
    if (!menu || !anchor || !isOpen) {
      return;
    }

    const contentHeight = menu.scrollHeight;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

    setLayout(
      computeDropdownMenuLayout(
        anchor.getBoundingClientRect(),
        contentHeight,
        openUpward,
        viewportHeight,
      ),
    );
  }, [anchorRef, isOpen, openUpward]);

  React.useLayoutEffect(() => {
    if (!isOpen) {
      setLayout(EMPTY_LAYOUT);
      return undefined;
    }

    measureLayout();

    const menu = menuRef.current;
    const resizeObserver =
      menu && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measureLayout)
        : null;
    if (menu && resizeObserver) {
      resizeObserver.observe(menu);
    }

    window.addEventListener("resize", measureLayout);
    window.visualViewport?.addEventListener("resize", measureLayout);
    window.visualViewport?.addEventListener("scroll", measureLayout);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureLayout);
      window.visualViewport?.removeEventListener("resize", measureLayout);
      window.visualViewport?.removeEventListener("scroll", measureLayout);
    };
  }, [
    isOpen,
    measureLayout,
    filteredOptions.length,
    footer,
    selectedItem?.value,
  ]);

  return (
    <div
      ref={menuRef}
      data-testid="dropdown-menu-panel"
      data-scrollable={layout.needsScroll ? "true" : "false"}
      className={cn(
        "absolute z-50 text-white",
        fitContent ? "min-w-full w-max" : "w-full",
        openUpward ? "bottom-full mb-1" : "mt-1",
        "bg-tertiary rounded-[6px] context-menu-box-shadow p-1",
        layout.needsScroll && "overflow-y-auto custom-scrollbar",
        !isOpen && "hidden",
      )}
      style={
        layout.maxHeightPx !== undefined
          ? { maxHeight: `${layout.maxHeightPx}px` }
          : undefined
      }
    >
      <ul
        {...getMenuProps({ className: cn("p-0", dropdownMenuListClassName) })}
      >
        {isOpen && filteredOptions.length === 0 && (
          <li className="px-2 py-2 text-sm text-[var(--oh-muted)] italic">
            {emptyMessage}
          </li>
        )}
        {isOpen &&
          filteredOptions.map((option, index) => (
            <li
              key={option.value}
              {...getItemProps({
                item: option,
                index,
                className: cn(
                  dropdownMenuRowClassName,
                  "focus:outline-none",
                  selectedItem?.value === option.value &&
                    "bg-[var(--oh-interactive-selected)] text-white",
                ),
              })}
            >
              {option.prefix ? (
                <span className={dropdownMenuRowIconWrapperClassName}>
                  {option.prefix}
                </span>
              ) : null}
              <DropdownOptionLabel option={option} />
            </li>
          ))}
      </ul>
      {isOpen && footer ? (
        <>
          <Divider inset="menu" />
          <div className="p-0">{footer}</div>
        </>
      ) : null}
    </div>
  );
}
