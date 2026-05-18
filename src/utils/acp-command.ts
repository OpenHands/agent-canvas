// ``shell-quote`` is a CJS module that does ``module.exports = { parse, quote }``;
// Vite's ESM interop can resolve a default/namespace import but not named
// imports against that shape (the dev server crashes with "does not provide
// an export named 'parse'"). Namespace import works on both the dev server
// and the Rollup-based prod build.
import * as shellQuote from "shell-quote";

const { parse, quote } = shellQuote;

/**
 * Parse a single-string shell-style command into argv tokens.
 *
 * Used by the Settings → Agent textarea — the user types one human-readable
 * command (e.g. ``bash -c "echo hello world"``) and we convert it into the
 * ``string[]`` shape that the agent-server's ``ACPAgent.acp_command``
 * expects.
 *
 * Why ``shell-quote`` instead of ``.split(/\s+/)``:
 *
 * ``shell-quote.parse`` follows shell-word semantics — quoted segments
 * stay together, escapes survive, and POSIX-style ``$VAR`` references
 * don't get mangled mid-token. A naive split corrupts every non-trivial
 * Custom command: ``bash -c "echo hello"`` would become
 * ``["bash", "-c", "\"echo", "hello\""]`` and the spawned subprocess
 * would either misbehave silently or fail in a confusing place.
 *
 * Built-in presets (``npx -y @org/pkg``) are simple enough that both
 * splitters produce the same output — this only matters for users who
 * pick the "Custom" preset.
 *
 * Anything the parser would treat as a shell expression (an unquoted
 * ``$VAR``, a glob, a redirect) is dropped — those entries come back
 * from ``shell-quote`` as objects rather than strings, and we filter
 * them out here so the argv list stays serialisable. The textarea's
 * helper text should make this constraint clear; callers that need
 * env-var expansion should set ``acp_env`` explicitly instead of
 * trying to inline ``$ANTHROPIC_API_KEY`` into the command.
 */
export function parseCommand(value: string): string[] {
  return parse(value).filter(
    (entry): entry is string => typeof entry === "string",
  );
}

// Tokens that need shell-quoting when rendering back to a string —
// whitespace, quotes, backslashes, redirects/pipes/globs, and the
// command-separators. ``@``, ``/``, ``-``, ``.``, ``+``, ``=`` and
// other punctuation that's common in package names and URLs are
// safe in argv-only contexts (the agent-server execs the array, no
// shell intermediary), so we leave them alone — otherwise
// ``npx -y @org/pkg`` would render as ``npx -y \@org/pkg`` and that's
// a hostile read-back in the textarea.
const SHELL_UNSAFE = /[\s"'\\$`&|;<>(){}*?#!~[\]]/;

/**
 * Render a ``string[]`` argv back into a single string the textarea
 * can display. Tokens that *would* need shell quoting (whitespace,
 * quotes, redirects, …) go through ``shell-quote.quote`` for correct
 * escaping; tokens that are already shell-safe (the overwhelming
 * majority of package names and CLI flags) round-trip verbatim. The
 * output remains a valid input to {@link parseCommand}.
 */
export function formatCommand(command: readonly string[]): string {
  return command
    .map((tok) => (SHELL_UNSAFE.test(tok) ? quote([tok]) : tok))
    .join(" ");
}
