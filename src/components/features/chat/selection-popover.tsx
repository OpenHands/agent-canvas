import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, MessageSquarePlus, X } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { cn } from "#/utils/utils";

interface SelectionPopoverProps {
  /** Container whose text selections should trigger the popover. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Called with the selected text and the user's note when submitted. */
  onAddToPrompt: (selectedText: string, comment: string) => void;
}

type PopoverState =
  | { type: "hidden" }
  | { type: "button"; selectedText: string; rect: DOMRect }
  | { type: "input"; selectedText: string; rect: DOMRect };

/**
 * Floating popover that appears when the user selects text inside
 * `containerRef`. Shows a "Comment" affordance that expands into a note field,
 * letting the user push the selection (and an optional instruction) into the
 * chat composer.
 */
export function SelectionPopover({
  containerRef,
  onAddToPrompt,
}: SelectionPopoverProps) {
  const { t } = useTranslation("openhands");
  const [state, setState] = React.useState<PopoverState>({ type: "hidden" });
  const [comment, setComment] = React.useState("");
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  // Tracks interactions that originate inside the popover so the container's
  // selection handlers can bail out.
  const interactingRef = React.useRef(false);

  const hide = React.useCallback(() => {
    setState({ type: "hidden" });
    setComment("");
  }, []);

  const getSelection = React.useCallback((): {
    text: string;
    rect: DOMRect;
  } | null => {
    const container = containerRef.current;
    if (!container) return null;

    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) return null;

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return null;

    return {
      text: selection.toString().trim(),
      rect: range.getBoundingClientRect(),
    };
  }, [containerRef]);

  // Detect text selection within the container.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const handleMouseUp = () => {
      if (interactingRef.current) return;
      // Defer so the browser finalizes the selection first.
      requestAnimationFrame(() => {
        // Never collapse the open note field from a stray selection change.
        if (state.type === "input") return;
        const result = getSelection();
        if (result) {
          setState({
            type: "button",
            selectedText: result.text,
            rect: result.rect,
          });
        } else {
          hide();
        }
      });
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      // Keep the note field open while the user interacts within the container.
      if (state.type === "input") return;
      hide();
    };

    container.addEventListener("mouseup", handleMouseUp);
    container.addEventListener("mousedown", handleMouseDown);
    return () => {
      container.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("mousedown", handleMouseDown);
    };
  }, [containerRef, getSelection, hide, state.type]);

  // Focus the note field when it opens.
  React.useEffect(() => {
    if (state.type === "input") {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [state.type]);

  // Dismiss when clicking entirely outside the container and popover.
  React.useEffect(() => {
    if (state.type === "hidden") return undefined;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      hide();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [state.type, containerRef, hide]);

  const handleSubmit = React.useCallback(() => {
    if (state.type !== "input") return;
    onAddToPrompt(state.selectedText, comment.trim());
    hide();
    window.getSelection()?.removeAllRanges();
  }, [state, comment, onAddToPrompt, hide]);

  if (state.type === "hidden") return null;

  const container = containerRef.current;
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();
  const { rect } = state;
  const isInput = state.type === "input";

  // Position below the selection, clamped within the container.
  const top = rect.bottom - containerRect.top + container.scrollTop + 8;
  const left = Math.max(
    8,
    Math.min(
      rect.left + rect.width / 2 - containerRect.left - (isInput ? 160 : 50),
      containerRect.width - (isInput ? 328 : 108),
    ),
  );

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- handlers only stop propagation so the container's selection logic ignores clicks inside the popover
    <div
      ref={popoverRef}
      role="dialog"
      data-testid="selection-popover"
      className={cn(
        "absolute z-50 rounded-xl border shadow-lg",
        "border-[var(--oh-border-subtle)] bg-[var(--oh-surface-raised)]",
      )}
      style={{ top: `${top}px`, left: `${left}px` }}
      onMouseDown={(e) => {
        e.stopPropagation();
        interactingRef.current = true;
      }}
      onMouseUp={(e) => {
        e.stopPropagation();
        requestAnimationFrame(() => {
          interactingRef.current = false;
        });
      }}
    >
      {state.type === "button" ? (
        <button
          type="button"
          data-testid="selection-popover-comment"
          onClick={() =>
            setState({
              type: "input",
              selectedText: state.selectedText,
              rect: state.rect,
            })
          }
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--oh-foreground)] transition-colors hover:bg-[var(--oh-interactive-hover)]"
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span>{t(I18nKey.SELECTION$COMMENT)}</span>
        </button>
      ) : (
        <div className="flex w-80 flex-col gap-2 p-3">
          <div className="max-h-20 overflow-auto rounded-md bg-[var(--oh-surface)] px-2.5 py-1.5">
            <p className="line-clamp-3 font-mono text-xs text-[var(--oh-muted)]">
              {state.selectedText}
            </p>
          </div>

          <textarea
            ref={textareaRef}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t(I18nKey.SELECTION$NOTE_PLACEHOLDER)}
            rows={2}
            data-testid="selection-popover-note"
            className="w-full resize-none rounded-md border border-[var(--oh-border-input)] bg-[var(--oh-surface)] px-2.5 py-2 text-sm text-[var(--oh-foreground)] placeholder:text-[var(--oh-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--oh-border)]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                hide();
              }
            }}
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={hide}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--oh-muted)] transition-colors hover:text-[var(--oh-foreground)]"
            >
              <X className="h-3 w-3" />
              {t(I18nKey.BUTTON$CANCEL)}
            </button>
            <BrandButton
              type="button"
              variant="primary"
              testId="selection-popover-submit"
              onClick={handleSubmit}
              className="h-7 gap-1.5 rounded-lg px-3 text-xs font-medium"
            >
              <span className="flex items-center gap-1.5">
                {t(I18nKey.SELECTION$ADD_TO_PROMPT)}
                <ArrowRight className="h-3 w-3" />
              </span>
            </BrandButton>
          </div>
        </div>
      )}
    </div>
  );
}
