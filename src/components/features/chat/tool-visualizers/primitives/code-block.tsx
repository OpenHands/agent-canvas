import { HighlightedCode } from "../../../markdown/highlighted-code";
import { CopyableContentWrapper } from "#/components/shared/buttons/copyable-content-wrapper";
import { MAX_CONTENT_LENGTH } from "#/components/conversation-events/chat/event-content-helpers/shared";

interface CodeBlockProps {
  code: string;
  /** Prism language hint (e.g. "bash", "python"). */
  language?: string;
  /** Show a copy button on hover. Defaults to true. */
  copy?: boolean;
}

/**
 * Syntax-highlighted code block with an optional hover copy button. Long
 * content is truncated to the same limit the markdown path uses; the copy
 * button always yields the full, untruncated text.
 */
export function CodeBlock({ code, language, copy = true }: CodeBlockProps) {
  const display =
    code.length > MAX_CONTENT_LENGTH
      ? `${code.slice(0, MAX_CONTENT_LENGTH)}…`
      : code;

  const block = (
    <HighlightedCode
      className="rounded-lg text-xs"
      language={language}
      code={display}
    />
  );

  return copy ? (
    <CopyableContentWrapper text={code}>{block}</CopyableContentWrapper>
  ) : (
    block
  );
}
