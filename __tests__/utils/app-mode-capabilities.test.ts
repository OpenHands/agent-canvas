import { describe, expect, it } from "vitest";
import {
  canUseWorkMode,
  getEffectiveAppMode,
  getEffectiveHomePath,
  resolveWorkModeCapabilities,
} from "#/utils/app-mode-capabilities";

describe("app-mode-capabilities", () => {
  describe("defaults (no workExecution override)", () => {
    it("allows work mode only on local backends", () => {
      expect(canUseWorkMode({ backendKind: "local" })).toBe(true);
      expect(canUseWorkMode({ backendKind: "cloud" })).toBe(false);
    });

    it("falls back to code mode on cloud backends", () => {
      expect(getEffectiveAppMode("work", { backendKind: "cloud" })).toBe(
        "code",
      );
      expect(getEffectiveAppMode("work", { backendKind: "local" })).toBe(
        "work",
      );
      expect(getEffectiveAppMode("code", { backendKind: "cloud" })).toBe(
        "code",
      );
    });

    it("routes home through the effective mode", () => {
      expect(getEffectiveHomePath("work", { backendKind: "cloud" })).toBe(
        "/conversations",
      );
      expect(getEffectiveHomePath("work", { backendKind: "local" })).toBe(
        "/work",
      );
    });
  });

  describe("workExecution overrides (future cloud Work)", () => {
    it("allows hybrid cloud Code + local Work when configured", () => {
      const caps = resolveWorkModeCapabilities({
        backendKind: "cloud",
        workExecution: "local",
        hasLocalBackend: true,
      });

      expect(caps).toEqual({ execution: "local", allowed: true });
      expect(
        getEffectiveAppMode("work", {
          backendKind: "cloud",
          workExecution: "local",
          hasLocalBackend: true,
        }),
      ).toBe("work");
    });

    it("blocks local Work on cloud when no local backend is registered", () => {
      expect(
        resolveWorkModeCapabilities({
          backendKind: "cloud",
          workExecution: "local",
          hasLocalBackend: false,
        }),
      ).toEqual({ execution: "local", allowed: false });
    });

    it("allows hosted Work on cloud backends when configured", () => {
      expect(
        resolveWorkModeCapabilities({
          backendKind: "cloud",
          workExecution: "hosted",
        }),
      ).toEqual({ execution: "hosted", allowed: true });
    });

    it("disables Work when explicitly set to none", () => {
      expect(
        resolveWorkModeCapabilities({
          backendKind: "local",
          workExecution: "none",
        }),
      ).toEqual({ execution: "none", allowed: false });
    });
  });
});
