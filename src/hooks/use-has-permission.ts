// Simple permission hook for OSS agent-canvas
// In the OSS context, all authenticated users have full access
export function useHasPermission(_permission: string): boolean {
  // In OSS mode, always return true - no permission restrictions
  return true;
}
