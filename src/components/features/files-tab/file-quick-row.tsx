import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import ChevronDown from "#/icons/chevron-down.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { sortFilesByPriority } from "#/utils/file-priority";
import { cn } from "#/utils/utils";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";

interface FileQuickRowProps {
  paths: string[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * Horizontal "quick access" row of files at the top of the file viewer.
 * Important entrypoints (index.html, README.md, package.json, …) appear
 * first; if the row would overflow, the rest spill into a dropdown so users
 * can still reach every file alphabetically.
 */
export function FileQuickRow({
  paths,
  selectedPath,
  onSelectFile,
}: FileQuickRowProps) {
  const { t } = useTranslation("openhands");
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(paths.length);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const sortedByPriority = useMemo(() => sortFilesByPriority(paths), [paths]);

  // Alphabetical list for the overflow dropdown.
  const sortedAlphabetically = useMemo(
    () => [...paths].sort((a, b) => a.localeCompare(b)),
    [paths],
  );

  // Re-measure visible count whenever the paths or container width changes.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return undefined;

    const recompute = () => {
      const containerWidth = container.clientWidth;
      // Reserve room for the trailing "more files" dropdown trigger.
      const reserved = 110;
      const available = Math.max(containerWidth - reserved, 0);

      let used = 0;
      let count = 0;
      const chips = Array.from(measure.children) as HTMLElement[];
      for (const chip of chips) {
        const width = chip.getBoundingClientRect().width + 6; // gap-1.5
        if (used + width > available) break;
        used += width;
        count += 1;
      }
      setVisibleCount(count || Math.min(1, sortedByPriority.length));
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [sortedByPriority]);

  const visiblePaths = sortedByPriority.slice(0, visibleCount);
  const hasOverflow = visibleCount < sortedByPriority.length;

  const menuRef = useClickOutsideElement<HTMLDivElement>(() =>
    setIsMenuOpen(false),
  );

  // Close menu on Escape.
  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMenuOpen]);

  if (paths.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="relative flex items-center gap-1.5 border-b border-[#3A3D44] px-2 py-1.5 min-h-[34px]"
      data-testid="file-quick-row"
    >
      {/* Hidden measurement layer: always renders every chip so we can
          measure their natural widths and decide how many fit. */}
      <div
        ref={measureRef}
        aria-hidden
        className="invisible absolute -z-10 flex flex-nowrap items-center gap-1.5"
      >
        {sortedByPriority.map((path) => (
          <span
            key={`measure-${path}`}
            className="inline-flex items-center px-2 py-0.5 text-xs whitespace-nowrap rounded-md bg-[#2F3137]"
          >
            {basename(path)}
          </span>
        ))}
      </div>

      <div className="flex flex-nowrap items-center gap-1.5 overflow-hidden flex-1">
        {visiblePaths.map((path) => {
          const isSelected = selectedPath === path;
          return (
            <button
              key={path}
              type="button"
              onClick={() => onSelectFile(path)}
              title={path}
              data-testid={`file-quick-row-item-${path}`}
              className={cn(
                "inline-flex items-center px-2 py-0.5 text-xs whitespace-nowrap rounded-md cursor-pointer",
                isSelected
                  ? "bg-[#474A54] text-white"
                  : "bg-[#2F3137] text-[#D6D6D6] hover:bg-[#3A3D44]",
              )}
            >
              {basename(path)}
            </button>
          );
        })}
      </div>

      {hasOverflow && (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            data-testid="file-quick-row-overflow-toggle"
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md",
              "bg-[#2F3137] text-[#D6D6D6] hover:bg-[#3A3D44] cursor-pointer",
            )}
            aria-haspopup="listbox"
            aria-expanded={isMenuOpen}
            aria-label={t(I18nKey.FILES$MORE_FILES)}
          >
            <span>{t(I18nKey.FILES$MORE_FILES)}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {isMenuOpen && (
            <ul
              role="listbox"
              data-testid="file-quick-row-overflow-menu"
              className={cn(
                "absolute right-0 top-full mt-1 z-20",
                "max-h-72 w-72 overflow-y-auto rounded-md border border-[#3A3D44]",
                "bg-[#1F2125] shadow-lg custom-scrollbar-always",
              )}
            >
              {sortedAlphabetically.map((path) => {
                const isSelected = selectedPath === path;
                return (
                  <li
                    key={`overflow-${path}`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectFile(path);
                        setIsMenuOpen(false);
                      }}
                      title={path}
                      data-testid={`file-quick-row-overflow-item-${path}`}
                      className={cn(
                        "block w-full px-3 py-1.5 text-left text-xs cursor-pointer",
                        isSelected
                          ? "bg-[#474A54] text-white"
                          : "text-[#D6D6D6] hover:bg-[#3A3D44]",
                      )}
                    >
                      {path}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
