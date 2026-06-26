import { describe, expect, it } from "vitest";
import { getHomePathForAppMode, isWorkModePath } from "#/utils/app-mode";

describe("app-mode utils", () => {
  it("maps modes to home paths", () => {
    expect(getHomePathForAppMode("code")).toBe("/conversations");
    expect(getHomePathForAppMode("work")).toBe("/work");
  });

  it("detects work mode paths", () => {
    expect(isWorkModePath("/work")).toBe(true);
    expect(isWorkModePath("/work/tasks/abc")).toBe(true);
    expect(isWorkModePath("/conversations")).toBe(false);
  });
});
