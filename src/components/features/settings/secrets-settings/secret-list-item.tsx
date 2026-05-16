import { Pencil, Trash2 } from "lucide-react";

export function SecretListItemSkeleton() {
  return (
    <div className="border-t border-[var(--oh-border-input)] last-of-type:border-b w-full min-w-0 pr-2.5 py-[13px] flex items-center justify-between">
      <div className="flex items-center justify-between w-1/3">
        <span className="skeleton h-4 w-1/2" />
        <span className="skeleton h-4 w-1/4" />
      </div>

      <div className="flex items-center gap-1">
        <span className="skeleton h-4 w-4" />
        <span className="skeleton h-4 w-4" />
      </div>
    </div>
  );
}

interface SecretListItemProps {
  title: string;
  description?: string;
  onEdit: () => void;
  onDelete: () => void;
}

export function SecretListItem({
  title,
  description,
  onEdit,
  onDelete,
}: SecretListItemProps) {
  return (
    <tr
      data-testid="secret-item"
      className="border-t border-[var(--oh-border)]"
    >
      <td className="px-3 py-2 text-sm text-content-2 truncate" title={title}>
        {title}
      </td>

      <td
        className="px-3 py-2 truncate overflow-hidden whitespace-nowrap text-sm text-content-2 opacity-80"
        title={description || ""}
      >
        {description || ""}
      </td>

      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-0.5">
          <button
            data-testid="edit-secret-button"
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${title}`}
            className="inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-muted transition-colors hover:bg-interactive-hover hover:text-white"
          >
            <Pencil aria-hidden className="size-4" strokeWidth={2} />
          </button>
          <button
            data-testid="delete-secret-button"
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${title}`}
            className="inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-muted transition-colors hover:bg-interactive-hover hover:text-white"
          >
            <Trash2 aria-hidden className="size-4" strokeWidth={2} />
          </button>
        </div>
      </td>
    </tr>
  );
}
