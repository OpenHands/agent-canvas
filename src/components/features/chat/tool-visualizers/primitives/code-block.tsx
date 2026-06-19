import React from "react";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { SyntaxHighlighter } from "../../../markdown/syntax-highlighter";
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
    <SyntaxHighlighter
      className="rounded-lg text-xs"
      style={vscDarkPlus}
      language={language}
      PreTag="div"
    >
      {display}
    </SyntaxHighlighter>
  );

  return copy ? (
    <CopyableContentWrapper text={code}>{block}</CopyableContentWrapper>
  ) : (
    block
  );
}
