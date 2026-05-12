import { create } from "zustand";

/**
 * Monotonic counter that ticks every time the agent commits a file-editor
 * mutation in the workspace. Used as a cache-buster for resources we serve
 * via the agent server's static workspace fileserver (iframes, images, PDFs):
 * appending `?v=<count>` to those URLs forces the browser to re-request a
 * fresh copy after each edit instead of reusing the previously-fetched
 * response — important because the rendered HTML may reference other
 * assets (CSS, images) that the user can't see directly but expects to
 * reflect the latest version of the workspace.
 *
 * Consumers:
 *   - {@link useAutoRefreshFilesOnEdit} bumps this on each mutation event.
 *   - {@link FileContentViewer} reads the count and appends it to its
 *     `<iframe>` / `<img>` src.
 */
interface WorkspaceMutationCounterState {
  count: number;
  bump: () => void;
}

export const useWorkspaceMutationCounter =
  create<WorkspaceMutationCounterState>((set) => ({
    count: 0,
    bump: () => set((state) => ({ count: state.count + 1 })),
  }));

/**
 * Append the current mutation counter as a `v=<n>` query parameter so the
 * browser refetches the URL after every agent-side edit. Returns `null` if
 * the input is `null` so callers can pass through optional URLs untouched.
 */
export function withWorkspaceCacheBuster(url: string, version: number): string;
export function withWorkspaceCacheBuster(
  url: string | null,
  version: number,
): string | null;
export function withWorkspaceCacheBuster(
  url: string | null,
  version: number,
): string | null {
  if (url === null) return null;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${version}`;
}
