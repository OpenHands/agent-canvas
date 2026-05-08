import { useTranslation } from "react-i18next";
import { FaFolder } from "react-icons/fa6";
import { I18nKey } from "#/i18n/declaration";
import RepoForkedIcon from "#/icons/repo-forked.svg?react";

interface NoRepositoryProps {
  workspaceWorkingDir?: string | null;
}

/**
 * Returns the basename (top-level folder name) of a workspace directory path,
 * tolerating both POSIX and Windows separators and trailing slashes.
 */
function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const idx = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export function NoRepository({ workspaceWorkingDir }: NoRepositoryProps) {
  const { t } = useTranslation("openhands");

  const folderName = workspaceWorkingDir
    ? basename(workspaceWorkingDir).trim()
    : "";

  if (folderName) {
    return (
      <div
        className="flex items-center gap-1 text-xs text-[#A3A3A3]"
        title={workspaceWorkingDir ?? undefined}
      >
        <FaFolder size={12} className="text-[#A3A3A3]" />
        <span className="whitespace-nowrap overflow-hidden text-ellipsis max-w-44">
          {folderName}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-xs text-[#A3A3A3]">
      <RepoForkedIcon width={14} height={14} className="text-[#A3A3A3]" />
      <span>{t(I18nKey.COMMON$NO_REPOSITORY)}</span>
    </div>
  );
}
