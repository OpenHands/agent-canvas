import React from "react";
import { cn } from "#/utils/utils";
import {
  dropdownInstantColorClassName,
  dropdownMenuRowGapClassName,
  dropdownMenuRowIconWrapperClassName,
} from "#/utils/dropdown-classes";

interface DropdownItemProps<T> {
  item: T;
  index: number;
  isSelected: boolean;
  getItemProps: <Options>(options: any & Options) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  getDisplayText: (item: T) => string;
  getItemKey: (item: T) => string;
  isProviderDropdown?: boolean;
  renderIcon?: (item: T) => React.ReactNode;
  itemClassName?: string;
}

export function DropdownItem<T>({
  item,
  index,
  isSelected,
  getItemProps,
  getDisplayText,
  getItemKey,
  isProviderDropdown = false,
  renderIcon,
  itemClassName,
}: DropdownItemProps<T>) {
  const itemProps = getItemProps({
    index,
    item,
    className: cn(
      isProviderDropdown
        ? "group px-2 py-0 cursor-pointer text-xs rounded-md mx-0 my-0 h-6 flex items-center"
        : "group px-2 py-2 cursor-pointer text-sm rounded-md mx-0 my-0.5",
      "text-white focus:outline-none font-normal",
      dropdownInstantColorClassName,
      {
        "bg-[var(--oh-interactive-selected)] text-white": isSelected,
        "hover:bg-[var(--oh-interactive-hover)]": !isSelected,
      },
      itemClassName,
    ),
  });

  return (
    <li key={getItemKey(item)} {...itemProps}>
      <div className={cn("flex items-center", dropdownMenuRowGapClassName)}>
        {renderIcon ? (
          <span className={dropdownMenuRowIconWrapperClassName}>
            {renderIcon(item)}
          </span>
        ) : null}
        <span className="font-normal">{getDisplayText(item)}</span>
      </div>
    </li>
  );
}
