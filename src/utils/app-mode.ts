import type { AppMode } from "#/types/app-mode";

export function getHomePathForAppMode(mode: AppMode): string {
  return mode === "work" ? "/work" : "/conversations";
}

export function isWorkModePath(pathname: string): boolean {
  return pathname === "/work" || pathname.startsWith("/work/");
}
