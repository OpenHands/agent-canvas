const REDACTED = "<redacted>";

// Mirrors openhands-sdk SECRET_KEY_PATTERNS (substring match, case-insensitive).
const SECRET_KEY_PATTERNS = [
  "AUTHORIZATION",
  "COOKIE",
  "CREDENTIAL",
  "KEY",
  "PASSWORD",
  "SECRET",
  "SESSION",
  "TOKEN",
] as const;

export function isSensitiveEnvVarName(name: string): boolean {
  const upper = name.toUpperCase();
  return SECRET_KEY_PATTERNS.some((pattern) => upper.includes(pattern));
}

// export VAR='value', export VAR="value", or export VAR=unquoted
const EXPORT_ASSIGNMENT =
  /export\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|[^\s&;|\\]+)/g;

function redactAssignment(
  match: string,
  name: string,
  valuePart: string,
): string {
  if (!isSensitiveEnvVarName(name)) return match;
  const prefix = match.slice(0, match.length - valuePart.length);
  return `${prefix}'${REDACTED}'`;
}

/**
 * Redact credential-bearing shell environment assignments before showing
 * automation run logs. Covers inline `export VAR=value` chains produced by
 * the automation backend when bootstrapping a run workspace.
 */
export function redactShellSecrets(text: string): string {
  if (!text) return text;

  return text.replace(EXPORT_ASSIGNMENT, redactAssignment);
}
