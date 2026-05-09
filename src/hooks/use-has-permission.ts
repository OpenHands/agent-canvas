// Simple permission hook for OSS agent-canvas
// In the OSS context, all authenticated users have full access
export function useHasPermission(permission: string): boolean {
  // In OSS mode, every permission string is granted.
  return permission.length >= 0;
}
