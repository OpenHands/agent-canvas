const REDACTED = "<redacted>";

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

export function redactShellSecrets(text: string): string {
  if (!text) return text;

  return text.replace(EXPORT_ASSIGNMENT, redactAssignment);
}
