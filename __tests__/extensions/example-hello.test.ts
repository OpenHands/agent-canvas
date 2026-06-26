import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseManifest } from "#/extensions/manifest";
import { loadExtension, type BundleSource } from "#/extensions/loader";
import { contributionRegistry } from "#/extensions/contribution-registry";

/**
 * Guards the shipped sample extension (`examples/extensions/hello-sidebar`) against
 * schema/loader drift: the documented authoring format must keep validating and
 * loading.
 */
const manifestPath = resolve(
  process.cwd(),
  "examples/extensions/hello-sidebar/extension.json",
);
const rawManifest = JSON.parse(readFileSync(manifestPath, "utf8"));

describe("examples/extensions/hello-sidebar", () => {
  afterEach(() => contributionRegistry.clear());

  it("validates against the manifest schema", () => {
    const result = parseManifest(rawManifest);
    expect(result.ok).toBe(true);
  });

  it("loads its declarative contributions through the loader", async () => {
    const source: BundleSource = {
      readManifest: async () => rawManifest,
      assetUrl: async (path) => `blob:${path}`,
    };
    const host = {
      activate: vi.fn(),
      runCommand: vi.fn(),
      openView: vi.fn(),
    };

    const result = await loadExtension(source, host);
    expect(result.ok).toBe(true);

    const items = contributionRegistry.getActivityBarItems();
    expect(items.map((i) => i.title)).toEqual(["Hello"]);
    expect(items[0].iconUrl).toBe("blob:icon.svg");

    const commands = contributionRegistry.getCommands();
    expect(commands.map((c) => c.command)).toEqual(["hello.say"]);
  });
});
