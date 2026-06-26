import { describe, expect, it, vi } from "vitest";
import {
  createHostMethods,
  type HostApiDeps,
} from "#/extensions/host/host-api";
import type { Capability } from "#/extensions/manifest";

function makeDeps(overrides: Partial<HostApiDeps> = {}): HostApiDeps {
  return {
    getActiveConversation: () => ({
      id: "c1",
      title: "Active",
      status: "running",
    }),
    showInformationMessage: vi.fn(),
    executeCommand: vi.fn(async () => "executed"),
    storageGet: vi.fn(() => "stored"),
    storageSet: vi.fn(),
    ...overrides,
  };
}

function methodsFor(capabilities: Capability[], deps = makeDeps()) {
  return createHostMethods("acme.ext", capabilities, deps);
}

describe("createHostMethods (capability gating)", () => {
  it("exposes ungated UI affordances without capabilities", async () => {
    const deps = makeDeps();
    const methods = methodsFor([], deps);

    methods["window.showInformationMessage"]({ message: "hi" });
    expect(deps.showInformationMessage).toHaveBeenCalledWith("hi");

    await expect(
      methods["commands.execute"]({ command: "core.save", args: [] }),
    ).resolves.toBe("executed");
  });

  it("allows conversation.getActive when conversation:read is granted", () => {
    const methods = methodsFor(["conversation:read"]);
    expect(methods["conversation.getActive"](undefined)).toEqual({
      id: "c1",
      title: "Active",
      status: "running",
    });
  });

  it("throws conversation.getActive without the capability", () => {
    const methods = methodsFor([]);
    expect(() => methods["conversation.getActive"](undefined)).toThrow(
      /missing capability: conversation:read/,
    );
  });

  it("gates storage behind the storage capability", () => {
    const denied = methodsFor([]);
    expect(() => denied["storage.get"]({ key: "k" })).toThrow(
      /missing capability: storage/,
    );

    const deps = makeDeps();
    const granted = methodsFor(["storage"], deps);
    expect(granted["storage.get"]({ key: "k" })).toBe("stored");
    granted["storage.set"]({ key: "k", value: 1 });
    expect(deps.storageSet).toHaveBeenCalledWith("acme.ext", "k", 1);
  });

  it("returns null from storage.get when nothing is stored", () => {
    const deps = makeDeps({ storageGet: () => undefined });
    const methods = methodsFor(["storage"], deps);
    expect(methods["storage.get"]({ key: "missing" })).toBeNull();
  });
});
