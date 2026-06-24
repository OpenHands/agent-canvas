import { describe, it, expect } from "vitest";
import { ConversationSearch } from "./conversation-search";

const conv = (fields: {
  title?: string | null;
  selected_repository?: string | null;
  selected_branch?: string | null;
  owner?: string | null;
}) => ({
  title: fields.title ?? null,
  selected_repository: fields.selected_repository ?? null,
  selected_branch: fields.selected_branch ?? null,
  owner: fields.owner ?? null,
});

describe("ConversationSearch.matches", () => {
  it("matches an empty query against everything", () => {
    expect(ConversationSearch.matches(conv({ title: "anything" }), "")).toBe(
      true,
    );
    expect(ConversationSearch.matches(conv({ title: "anything" }), "   ")).toBe(
      true,
    );
  });

  it("matches case-insensitively across title, repo, branch, owner", () => {
    const c = conv({
      title: "Fix login",
      selected_repository: "spotwise/ui",
      selected_branch: "feature/auth",
      owner: "me@spotwise.ai",
    });
    expect(ConversationSearch.matches(c, "LOGIN")).toBe(true);
    expect(ConversationSearch.matches(c, "spotwise/ui")).toBe(true);
    expect(ConversationSearch.matches(c, "auth")).toBe(true);
    expect(ConversationSearch.matches(c, "me@spotwise")).toBe(true);
  });

  it("requires every whitespace-separated term to match (AND)", () => {
    const c = conv({ title: "Fix login", selected_repository: "spotwise/ui" });
    expect(ConversationSearch.matches(c, "fix ui")).toBe(true);
    expect(ConversationSearch.matches(c, "fix nope")).toBe(false);
  });

  it("does not match when no field contains the term", () => {
    expect(
      ConversationSearch.matches(conv({ title: "Fix login" }), "deploy"),
    ).toBe(false);
  });

  it("ignores null/absent fields without throwing", () => {
    expect(ConversationSearch.matches(conv({}), "anything")).toBe(false);
    expect(ConversationSearch.matches(conv({}), "")).toBe(true);
  });
});

describe("ConversationSearch.filter", () => {
  const a = conv({ title: "Fix login", selected_repository: "spotwise/ui" });
  const b = conv({ title: "Add search", selected_repository: "spotwise/api" });
  const list = [a, b];

  it("returns all on empty query (new array)", () => {
    const result = ConversationSearch.filter(list, "");
    expect(result).toEqual(list);
    expect(result).not.toBe(list);
  });

  it("narrows to matching conversations", () => {
    expect(ConversationSearch.filter(list, "search")).toEqual([b]);
    expect(ConversationSearch.filter(list, "spotwise")).toEqual([a, b]);
    expect(ConversationSearch.filter(list, "login api")).toEqual([]);
  });
});
