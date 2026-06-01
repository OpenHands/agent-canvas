const MASKED_PLACEHOLDER = "<secret-hidden>";

// Closing tag is optional so a truncated block is still redacted, not leaked.
const CUSTOM_SECRETS_BLOCK =
  /(<CUSTOM_SECRETS>)([\s\S]*?)(<\/CUSTOM_SECRETS>|$)/gi;

// `KEY: value` / `KEY=value`, capturing key + separator so only the value changes.
const SECRET_LINE = /^(\s*[^=:\n]+?\s*[:=]\s*)(.+?)\s*$/gm;

/**
 * Defensive backstop: redact any unmasked value inside a `<CUSTOM_SECRETS>`
 * block before showing dynamic context in the UI, in case backend masking
 * regresses. Text outside the block is untouched.
 */
export function redactCustomSecrets(text: string): string {
  return text.replace(
    CUSTOM_SECRETS_BLOCK,
    (_match, open: string, body: string, close: string) => {
      const redactedBody = body.replace(
        SECRET_LINE,
        (lineMatch, prefix: string, value: string) =>
          value === MASKED_PLACEHOLDER
            ? lineMatch
            : `${prefix}${MASKED_PLACEHOLDER}`,
      );
      return `${open}${redactedBody}${close}`;
    },
  );
}
