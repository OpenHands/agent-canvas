/**
 * Format a text selection (plus an optional note) as a markdown blockquote so
 * it reads clearly once dropped into the composer:
 *
 *   > selected line one
 *   > selected line two
 *
 *   the user's note
 */
export const formatSelectionPrompt = (
  selectedText: string,
  comment: string,
): string => {
  const quoted = selectedText
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const trimmedComment = comment.trim();
  return trimmedComment ? `${quoted}\n\n${trimmedComment}` : quoted;
};

/**
 * Append an addition to the current composer draft, preserving whatever the
 * user has already typed. A blank-line separator is inserted only when there
 * is existing, non-whitespace content.
 */
export const appendToDraft = (current: string, addition: string): string => {
  const base = current.replace(/\s+$/, "");
  return base.length > 0 ? `${base}\n\n${addition}` : addition;
};
