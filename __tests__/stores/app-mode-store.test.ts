import { beforeEach, describe, expect, it } from "vitest";
import { useAppModeStore } from "#/stores/app-mode-store";

describe("useAppModeStore", () => {
  beforeEach(() => {
    useAppModeStore.setState({ mode: "code" });
  });

  it("defaults to code mode", () => {
    expect(useAppModeStore.getState().mode).toBe("code");
  });

  it("persists work mode updates", () => {
    useAppModeStore.getState().setMode("work");
    expect(useAppModeStore.getState().mode).toBe("work");
  });
});
