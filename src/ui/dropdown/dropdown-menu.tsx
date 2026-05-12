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
        "absolute z-10 w-full",
        openUpward ? "bottom-full mb-1" : "mt-1",
        "bg-[#1F1F1F] border border-[#242424] rounded-lg",
        "max-h-60 overflow-auto",
        !isOpen && "hidden",
      )}
    >
      <ul {...getMenuProps({ className: "p-1" })}>
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
                  "px-2 py-2 cursor-pointer text-sm rounded-md",
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
        <div className="border-t border-[#242424] p-1">{footer}</div>
      ) : null}
    </div>
  );
}
