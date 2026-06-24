import { describe, it, expect } from "vitest";
import { ConversationOwnership } from "./conversation-ownership";

// filter() is generic over the minimal { owner, source, project } shape, so
// test fixtures only carry the fields under test plus an id to assert on.
const conv = (
  id: string,
  owner: string | null,
  source: string | null,
  project: string | null = null,
) => ({ id, owner, source, project });

describe("ConversationOwnership.isHermes", () => {
  it("is true only for source 'hermes' (case-insensitive)", () => {
    expect(ConversationOwnership.isHermes(conv("a", null, "hermes"))).toBe(
      true,
    );
    expect(ConversationOwnership.isHermes(conv("a", null, "HERMES"))).toBe(
      true,
    );
    expect(ConversationOwnership.isHermes(conv("a", null, "gui"))).toBe(false);
    expect(ConversationOwnership.isHermes(conv("a", null, null))).toBe(false);
  });
});

describe("ConversationOwnership.matchesOwner", () => {
  it("matches case-insensitively and trims", () => {
    expect(
      ConversationOwnership.matchesOwner(
        conv("a", "Me@Spotwise.ai", "gui"),
        " me@spotwise.ai ",
      ),
    ).toBe(true);
  });

  it("is false when owner or email is missing", () => {
    expect(
      ConversationOwnership.matchesOwner(conv("a", null, "gui"), "me@x.ai"),
    ).toBe(false);
    expect(
      ConversationOwnership.matchesOwner(conv("a", "me@x.ai", "gui"), null),
    ).toBe(false);
    expect(
      ConversationOwnership.matchesOwner(conv("a", "me@x.ai", "gui"), "  "),
    ).toBe(false);
  });
});

describe("ConversationOwnership.filter", () => {
  const mine = conv("mine", "me@x.ai", "gui");
  const yours = conv("yours", "you@x.ai", "gui");
  const hermesMine = conv("hermesMine", "me@x.ai", "hermes");
  const ownerless = conv("ownerless", null, null);
  const all = [mine, yours, hermesMine, ownerless];

  it("returns everything with all/all", () => {
    expect(
      ConversationOwnership.filter(all, {
        ownerScope: "all",
        sourceScope: "all",
        currentUserEmail: "me@x.ai",
      }).map((c) => c.id),
    ).toEqual(["mine", "yours", "hermesMine", "ownerless"]);
  });

  it("scopes to mine across sources", () => {
    expect(
      ConversationOwnership.filter(all, {
        ownerScope: "mine",
        sourceScope: "all",
        currentUserEmail: "me@x.ai",
      }).map((c) => c.id),
    ).toEqual(["mine", "hermesMine"]);
  });

  it("filters by source: app excludes hermes, hermes only hermes", () => {
    expect(
      ConversationOwnership.filter(all, {
        ownerScope: "all",
        sourceScope: "app",
        currentUserEmail: null,
      }).map((c) => c.id),
    ).toEqual(["mine", "yours", "ownerless"]);

    expect(
      ConversationOwnership.filter(all, {
        ownerScope: "all",
        sourceScope: "hermes",
        currentUserEmail: null,
      }).map((c) => c.id),
    ).toEqual(["hermesMine"]);
  });

  it("combines owner + source scopes", () => {
    expect(
      ConversationOwnership.filter(all, {
        ownerScope: "mine",
        sourceScope: "app",
        currentUserEmail: "me@x.ai",
      }).map((c) => c.id),
    ).toEqual(["mine"]);
  });

  it("mine with no identity yields nothing (graceful)", () => {
    expect(
      ConversationOwnership.filter(all, {
        ownerScope: "mine",
        sourceScope: "all",
        currentUserEmail: null,
      }),
    ).toEqual([]);
  });
});

describe("ConversationOwnership.matchesProjectScope", () => {
  it('"all" matches everything, including unprojected', () => {
    expect(
      ConversationOwnership.matchesProjectScope(
        conv("a", null, null, null),
        "all",
      ),
    ).toBe(true);
    expect(
      ConversationOwnership.matchesProjectScope(
        conv("a", null, null, "billing"),
        "all",
      ),
    ).toBe(true);
  });

  it("a slug scope matches only that project (case-insensitive)", () => {
    expect(
      ConversationOwnership.matchesProjectScope(
        conv("a", null, null, "Billing"),
        {
          slug: "billing",
        },
      ),
    ).toBe(true);
    expect(
      ConversationOwnership.matchesProjectScope(conv("a", null, null, "web"), {
        slug: "billing",
      }),
    ).toBe(false);
    expect(
      ConversationOwnership.matchesProjectScope(conv("a", null, null, null), {
        slug: "billing",
      }),
    ).toBe(false);
  });
});

describe("ConversationOwnership.filter — project facet", () => {
  const billingMine = conv("bm", "me@x.ai", "gui", "billing");
  const webMine = conv("wm", "me@x.ai", "gui", "web");
  const billingHermes = conv("bh", "you@x.ai", "hermes", "billing");
  const all = [billingMine, webMine, billingHermes];

  it("defaults to all projects when projectScope omitted", () => {
    expect(
      ConversationOwnership.filter(all, {
        ownerScope: "all",
        sourceScope: "all",
        currentUserEmail: null,
      }).map((c) => c.id),
    ).toEqual(["bm", "wm", "bh"]);
  });

  it("scopes to a single project and ANDs with owner+source", () => {
    expect(
      ConversationOwnership.filter(all, {
        ownerScope: "all",
        sourceScope: "all",
        currentUserEmail: null,
        projectScope: { slug: "billing" },
      }).map((c) => c.id),
    ).toEqual(["bm", "bh"]);

    expect(
      ConversationOwnership.filter(all, {
        ownerScope: "mine",
        sourceScope: "app",
        currentUserEmail: "me@x.ai",
        projectScope: { slug: "billing" },
      }).map((c) => c.id),
    ).toEqual(["bm"]);
  });
});
