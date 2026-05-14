import React from "react";
import { cn } from "#/utils/utils";
import { DropdownOption } from "./types";

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
}

export function DropdownMenu({
  isOpen,
  filteredOptions,
  selectedItem,
  emptyMessage,
  getMenuProps,
  getItemProps,
  footer,
  openUpward = false,
}: DropdownMenuProps) {
  return (
    <div
      className={cn(
        "absolute z-50 w-full overflow-hidden text-white",
        openUpward ? "bottom-full mb-1" : "mt-1",
        "bg-tertiary rounded-[6px] context-menu-box-shadow py-[6px] px-1",
        "max-h-60 overflow-auto",
        !isOpen && "hidden",
      )}
    >
      <ul {...getMenuProps({ className: "p-0" })}>
        {isOpen && filteredOptions.length === 0 && (
          <li className="px-2 py-2 text-sm text-gray-400 italic">
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
                  "px-2 py-2 cursor-pointer text-sm rounded",
                  "text-white focus:outline-none font-normal",
                  "flex items-center gap-2",
                  selectedItem?.value === option.value
                    ? "bg-[#C9B974] text-black"
                    : "hover:bg-[#5C5D62]",
                ),
              })}
            >
              {option.prefix}
              <span className="min-w-0 truncate">{option.label}</span>
            </li>
          ))}
      </ul>
      {isOpen && footer ? (
        <>
          <div className="my-1 h-[1px] w-full bg-[#5C5D62]" />
          <div className="p-0">{footer}</div>
        </>
      ) : null}
    </div>
  );
}
