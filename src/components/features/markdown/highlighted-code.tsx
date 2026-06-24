import React from "react";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { SyntaxHighlighter } from "./syntax-highlighter";

interface HighlightedCodeProps {
  /** Raw code string to tokenize and render. */
  code: string;
  /** Prism language hint (e.g. "bash", "python"). */
  language?: string;
  className?: string;
}

/**
 * Memoized syntax-highlight boundary. Prism re-tokenizes on every render, so
 * during a streaming reply every already-complete code block in the live tail
 * message would be re-highlighted on each arriving token. Memoizing on the
 * primitive `(code, language, className)` inputs means a block is tokenized
 * once and skipped until its content actually changes. `style`/`PreTag` are
 * fixed here so they stay referentially stable and never bust the memo.
 */
function HighlightedCodeImpl({
  code,
  language,
  className,
}: HighlightedCodeProps) {
  return (
    <SyntaxHighlighter
      className={className}
      style={vscDarkPlus}
      language={language}
      PreTag="div"
    >
      {code}
    </SyntaxHighlighter>
  );
}

export const HighlightedCode = React.memo(HighlightedCodeImpl);
HighlightedCode.displayName = "HighlightedCode";
