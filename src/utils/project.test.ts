import { describe, it, expect } from "vitest";
import { Project } from "./project";

/** A valid slug is empty, or kebab-case with no leading/trailing/double hyphens. */
const SLUG_SHAPE = /^$|^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("Project.slugify", () => {
  it.each([
    ["Spotwise Billing", "spotwise-billing"],
    ["  Hello,  World!  ", "hello-world"],
    ["ALLCAPS", "allcaps"],
    ["already-kebab", "already-kebab"],
    ["snake_case_name", "snake-case-name"],
    ["multiple   spaces", "multiple-spaces"],
    ["a/b\\c.d", "a-b-c-d"],
    ["v2.0 release", "v2-0-release"],
    ["Café UI", "cafe-ui"],
    ["Über Project", "uber-project"],
    ["123", "123"],
    ["", ""],
    ["   ", ""],
    ["!!!", ""],
    ["---", ""],
    ["-leading and trailing-", "leading-and-trailing"],
  ])("slugifies %j → %j", (input, expected) => {
    expect(Project.slugify(input)).toBe(expected);
  });

  const samples = [
    "Spotwise Billing",
    "  weird __ INPUT // here ",
    "café",
    "v2.0",
    "ALLCAPS",
    "already-kebab-99",
    "!!!",
    "",
    "a-b-c",
    "trailing-",
  ];

  it("is idempotent (slugify ∘ slugify = slugify)", () => {
    for (const input of samples) {
      const once = Project.slugify(input);
      expect(Project.slugify(once)).toBe(once);
    }
  });

  it("always produces a validator-safe shape", () => {
    for (const input of samples) {
      expect(Project.slugify(input)).toMatch(SLUG_SHAPE);
    }
  });
});

describe("Project.parse", () => {
  it("derives a slug from the name and keeps the display name", () => {
    expect(Project.parse({ name: "Spotwise Billing" })).toEqual({
      slug: "spotwise-billing",
      name: "Spotwise Billing",
      repos: [],
      createdBy: null,
    });
  });

  it("trims the name but preserves its casing/spacing for display", () => {
    const project = Project.parse({ name: "  My Project  " });
    expect(project?.name).toBe("My Project");
    expect(project?.slug).toBe("my-project");
  });

  it("returns null for a blank name", () => {
    expect(Project.parse({ name: "" })).toBeNull();
    expect(Project.parse({ name: "   " })).toBeNull();
  });

  it("returns null when the name has no alphanumeric content", () => {
    expect(Project.parse({ name: "!!!" })).toBeNull();
    expect(Project.parse({ name: "—" })).toBeNull();
  });

  it("rejects names that slugify to the reserved 'all' sentinel", () => {
    for (const name of ["All", "all", "ALL", "All!", "  all  "]) {
      expect(Project.parse({ name })).toBeNull();
    }
  });

  it("trims and de-dupes repos preserving order", () => {
    const project = Project.parse({
      name: "P",
      repos: ["  org/a ", "org/b", "org/a", "  ", ""],
    });
    expect(project?.repos).toEqual(["org/a", "org/b"]);
  });

  it("normalizes a blank createdBy to null", () => {
    expect(Project.parse({ name: "P", createdBy: "  " })?.createdBy).toBeNull();
    expect(Project.parse({ name: "P", createdBy: "me@x.io" })?.createdBy).toBe(
      "me@x.io",
    );
  });
});

describe("Project.deriveFilterOptions", () => {
  const registry = [
    { slug: "billing", name: "Spotwise Billing", repos: [], createdBy: null },
    { slug: "alpha", name: "Alpha", repos: [], createdBy: null },
  ];

  it("counts conversations per slug and keeps empty registry projects", () => {
    const options = Project.deriveFilterOptions(registry, [
      { project: "billing" },
      { project: "billing" },
      { project: null },
    ]);
    const billing = options.find((o) => o.slug === "billing");
    const alpha = options.find((o) => o.slug === "alpha");
    expect(billing).toMatchObject({
      label: "Spotwise Billing",
      count: 2,
      inRegistry: true,
    });
    // Registry project with zero conversations stays selectable (count 0).
    expect(alpha).toMatchObject({ label: "Alpha", count: 0, inRegistry: true });
  });

  it("surfaces a foreign slug (no registry row) labeled by its slug", () => {
    const options = Project.deriveFilterOptions(registry, [
      { project: "hermes-board" },
    ]);
    expect(options.find((o) => o.slug === "hermes-board")).toMatchObject({
      label: "hermes-board",
      count: 1,
      inRegistry: false,
    });
  });

  it("de-dupes a slug present in both the registry and conversations", () => {
    const options = Project.deriveFilterOptions(registry, [
      { project: "billing" },
    ]);
    expect(options.filter((o) => o.slug === "billing")).toHaveLength(1);
  });

  it("never surfaces the reserved 'all' slug as a selectable option", () => {
    const options = Project.deriveFilterOptions(
      [{ slug: "alpha", name: "Alpha", repos: [], createdBy: null }],
      [{ project: "all" }, { project: "alpha" }],
    );
    expect(options.some((o) => o.slug === "all")).toBe(false);
    expect(options.map((o) => o.slug)).toEqual(["alpha"]);
  });

  it("ignores blank/whitespace project tags", () => {
    const options = Project.deriveFilterOptions(
      [],
      [{ project: "  " }, { project: "" }, { project: null }],
    );
    expect(options).toEqual([]);
  });

  it("sorts options by label", () => {
    const options = Project.deriveFilterOptions(registry, [
      { project: "zeta" },
    ]);
    expect(options.map((o) => o.label)).toEqual([
      "Alpha",
      "Spotwise Billing",
      "zeta",
    ]);
  });
});
