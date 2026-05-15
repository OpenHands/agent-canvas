import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import FileIcon from "#/icons/file.svg?react";
import FolderIcon from "#/icons/folder.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { buildFileTree, FileTreeNode } from "#/utils/file-tree";
import { cn } from "#/utils/utils";

interface FileTreeViewProps {
  paths: string[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

interface TreeNodeProps {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

function TreeNode({ node, depth, selectedPath, onSelectFile }: TreeNodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const indentPx = 8 + depth * 12;

  if (node.isDirectory) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          data-testid={`file-tree-dir-${node.path}`}
          className={cn(
            "flex w-full items-center gap-1.5 py-1 pr-2 text-left text-sm text-white",
            "hover:bg-tertiary cursor-pointer",
          )}
          style={{ paddingLeft: `${indentPx}px` }}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block w-3 text-[10px] text-[var(--oh-muted)] transition-transform",
              isOpen ? "rotate-90" : "rotate-0",
            )}
          >
            ▶
          </span>
          <FolderIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && node.children.length > 0 && (
          <ul>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isSelected = selectedPath === node.path;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectFile(node.path)}
        data-testid={`file-tree-file-${node.path}`}
        className={cn(
          "flex w-full items-center gap-1.5 py-1 pr-2 text-left text-sm",
          "hover:bg-tertiary cursor-pointer",
          isSelected
            ? "bg-[var(--oh-interactive-hover)] text-white"
            : "text-[var(--oh-text-tertiary)]",
        )}
        style={{ paddingLeft: `${indentPx + 16}px` }}
      >
        <FileIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}

export function FileTreeView({
  paths,
  selectedPath,
  onSelectFile,
}: FileTreeViewProps) {
  const { t } = useTranslation("openhands");
  const root = useMemo(() => buildFileTree(paths), [paths]);

  if (root.children.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-[var(--oh-muted)]">
        {t(I18nKey.FILES$NO_FILES)}
      </div>
    );
  }

  return (
    <ul className="py-1 custom-scrollbar-always" data-testid="file-tree-view">
      {root.children.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      ))}
    </ul>
  );
}
