import React, { useState, useMemo, useCallback, useRef } from "react";
import { useCombobox } from "downshift";
import { useTranslation } from "react-i18next";

import { cn } from "#/utils/utils";
import { LocalWorkspace } from "#/types/workspace";
import { I18nKey } from "#/i18n/declaration";
import RepoIcon from "#/icons/repo.svg?react";

import { ClearButton } from "../shared/clear-button";
import { ToggleButton } from "../shared/toggle-button";
import { DropdownItem } from "../shared/dropdown-item";
import { EmptyState } from "../shared/empty-state";
import { GenericDropdownMenu } from "../shared/generic-dropdown-menu";

export interface WorkspaceDropdownProps {
  workspaces: LocalWorkspace[];
  value: LocalWorkspace | null;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /**
   * Whether to surface the "Manage Workspaces" entry in the sticky footer.
   * Defaults to `workspaces.length > 0` when omitted; pass an explicit value
   * if there are workspace parents (whose children may not have loaded yet)
   * that should also count as "manageable".
   */
  showManage?: boolean;
  onChange: (workspace: LocalWorkspace | null) => void;
  onAddClick: () => void;
  onManageClick: () => void;
}

export function WorkspaceDropdown({
  workspaces,
  value,
  placeholder,
  className,
  disabled = false,
  showManage,
  onChange,
  onAddClick,
  onManageClick,
}: WorkspaceDropdownProps) {
  const { t } = useTranslation("openhands");
  const [inputValue, setInputValue] = useState(value?.name ?? "");
  const menuRef = useRef<HTMLUListElement>(null);

  const filteredWorkspaces = useMemo(() => {
    const trimmed = inputValue.trim().toLowerCase();
    if (!trimmed) return workspaces;
    return workspaces.filter(
      (w) =>
        w.name.toLowerCase().includes(trimmed) ||
        w.path.toLowerCase().includes(trimmed),
    );
  }, [workspaces, inputValue]);

  const handleSelectionChange = useCallback(
    (selectedItem: LocalWorkspace | null) => {
      onChange(selectedItem);
      if (selectedItem) {
        setInputValue(selectedItem.name);
      }
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    handleSelectionChange(null);
    setInputValue("");
  }, [handleSelectionChange]);

  const {
    isOpen,
    getToggleButtonProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
    selectedItem,
    closeMenu,
  } = useCombobox<LocalWorkspace>({
    items: filteredWorkspaces,
    itemToString: (item) => item?.name ?? "",
    selectedItem: value,
    onSelectedItemChange: ({ selectedItem: newSelectedItem }) => {
      handleSelectionChange(newSelectedItem ?? null);
    },
    inputValue,
    stateReducer: (state, actionAndChanges) =>
      actionAndChanges.type === useCombobox.stateChangeTypes.InputClick &&
      state.isOpen
        ? { ...actionAndChanges.changes, isOpen: true }
        : actionAndChanges.changes,
  });

  const renderItem = (
    item: LocalWorkspace,
    index: number,
    itemHighlightedIndex: number,
    itemSelectedItem: LocalWorkspace | null,
    itemGetItemProps: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ) => (
    <DropdownItem
      key={item.id}
      item={item}
      index={index}
      isSelected={itemSelectedItem?.id === item.id}
      getItemProps={itemGetItemProps}
      getDisplayText={(workspace) => workspace.name}
      getItemKey={(workspace) => workspace.id}
    />
  );

  const renderEmptyState = (emptyInputValue: string) => (
    <EmptyState
      inputValue={emptyInputValue}
      searchMessage={t(I18nKey.HOME$NO_WORKSPACES)}
      emptyMessage={t(I18nKey.HOME$NO_WORKSPACES)}
      testId="workspace-dropdown-empty"
    />
  );

  const stickyFooterItem = useMemo(
    () => (
      <div className="flex flex-col">
        <button
          type="button"
          data-testid="add-workspaces-button"
          className="flex items-center w-full px-2 py-2 text-sm text-white hover:bg-[var(--oh-interactive-hover)] rounded-md transition-colors duration-150 font-normal"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closeMenu();
            onAddClick();
          }}
        >
          {t(I18nKey.HOME$ADD_WORKSPACES)}
        </button>
        {(showManage ?? workspaces.length > 0) && (
          <button
            type="button"
            data-testid="manage-workspaces-button"
            className="flex items-center w-full px-2 py-2 text-sm text-white hover:bg-[var(--oh-interactive-hover)] rounded-md transition-colors duration-150 font-normal"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              closeMenu();
              onManageClick();
            }}
          >
            {t(I18nKey.HOME$MANAGE_WORKSPACES)}
          </button>
        )}
      </div>
    ),
    [onAddClick, onManageClick, t, closeMenu, workspaces.length, showManage],
  );

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <div className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10">
          <RepoIcon width={16} height={16} />
        </div>
        <input
          {...getInputProps({
            disabled,
            placeholder: placeholder ?? t(I18nKey.HOME$WORKSPACE_PLACEHOLDER),
            className: cn(
              "w-full px-3 py-2 border border-[var(--oh-border-input)] rounded-sm shadow-none h-[42px] min-h-[42px] max-h-[42px]",
              "bg-tertiary text-[var(--oh-muted)] placeholder:text-[var(--oh-muted)]",
              "focus:outline-none focus:ring-0 focus:border-[var(--oh-border-input)]",
              "disabled:bg-tertiary disabled:cursor-not-allowed disabled:opacity-60",
              "pl-7 pr-16 text-sm font-normal leading-5",
            ),
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              setInputValue(e.target.value);
            },
          })}
          data-testid="workspace-dropdown"
        />

        <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex items-center">
          {value && <ClearButton disabled={disabled} onClear={handleClear} />}
          <ToggleButton
            isOpen={isOpen}
            disabled={disabled}
            getToggleButtonProps={getToggleButtonProps}
            iconClassName="w-10 h-10"
          />
        </div>
      </div>

      <GenericDropdownMenu<LocalWorkspace>
        isOpen={isOpen}
        filteredItems={filteredWorkspaces}
        inputValue={inputValue}
        highlightedIndex={highlightedIndex}
        selectedItem={selectedItem}
        getMenuProps={getMenuProps}
        getItemProps={getItemProps}
        menuRef={menuRef}
        renderItem={renderItem}
        renderEmptyState={renderEmptyState}
        stickyFooterItem={stickyFooterItem}
        testId="workspace-dropdown-menu"
        itemKey={(item) => item.id}
      />
    </div>
  );
}
