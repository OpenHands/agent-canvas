import { describe, expect, it } from "vitest";
import {
  decodePageId,
  encodePageId,
  paginateResults,
} from "#/api/git-providers/paging-utils";

describe("paging-utils", () => {
  it("round-trips offsets through opaque base64 page ids", () => {
    const encoded = encodePageId(42);

    expect(encoded).not.toBe("42"); // opaque, not a raw int
    expect(decodePageId(encoded)).toBe(42);
    expect(decodePageId(null)).toBeNull();
    expect(decodePageId("not-base64-???")).toBeNull();
  });

  it("paginates fully-loaded lists with limit+1 next-page semantics", () => {
    const items = ["a", "b", "c", "d", "e"];

    const firstPage = paginateResults(items, null, 2);

    expect(firstPage.items).toEqual(["a", "b"]);
    expect(firstPage.next_page_id).not.toBeNull();

    const secondPage = paginateResults(items, firstPage.next_page_id, 2);
    const lastPage = paginateResults(items, secondPage.next_page_id, 2);

    expect(secondPage.items).toEqual(["c", "d"]);
    expect(lastPage.items).toEqual(["e"]);
    expect(lastPage.next_page_id).toBeNull();
  });
});
