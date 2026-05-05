/**
 * Pagination helpers ported from
 * openhands/app_server/utils/paging_utils.py.
 *
 * The page id is intentionally opaque — callers should round-trip the string
 * we hand back rather than parsing it. We base64 url-encode the underlying
 * offset so the wire format matches what the original Python backend used.
 */

const stripPadding = (value: string): string => value.replace(/=+$/u, "");

const restorePadding = (value: string): string => {
  const padLength = (4 - (value.length % 4)) % 4;
  return value + "=".repeat(padLength);
};

export const encodePageId = (value: number): string => {
  if (typeof window === "undefined") {
    return stripPadding(Buffer.from(String(value)).toString("base64url"));
  }
  const base64 = btoa(String(value));
  return stripPadding(base64.replace(/\+/g, "-").replace(/\//g, "_"));
};

export const decodePageId = (
  pageId: string | null | undefined,
): number | null => {
  if (!pageId) return null;
  try {
    const padded = restorePadding(pageId);
    const decoded =
      typeof window === "undefined"
        ? Buffer.from(padded, "base64url").toString("utf-8")
        : atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = Number.parseInt(decoded, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export interface Paginated<T> {
  items: T[];
  next_page_id: string | null;
}

/**
 * Slice a fully-loaded list into a page using the same offset semantics as
 * paginate_results() in the Python backend.
 */
export const paginateResults = <T>(
  items: T[],
  pageId: string | null | undefined,
  limit: number,
): Paginated<T> => {
  const start = decodePageId(pageId) ?? 0;
  const end = start + limit;
  const slice = items.slice(start, end);
  const nextPageId = end < items.length ? encodePageId(end) : null;
  return { items: slice, next_page_id: nextPageId };
};
