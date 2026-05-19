// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, "../package.json"), "utf8"),
) as {
  name: string;
  main: string;
  module: string;
  types: string;
  exports: Record<string, unknown>;
  scripts: Record<string, string>;
};

describe("package library metadata", () => {
  it("publishes the agent-canvas package entrypoints", () => {
    expect(packageJson.name).toBe("@openhands/agent-canvas");
    expect(packageJson.main).toBe("./dist/index.cjs");
    expect(packageJson.module).toBe("./dist/index.js");
    expect(packageJson.types).toBe("./dist/index.d.ts");
    expect(packageJson.exports).toMatchObject({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
        require: "./dist/index.cjs",
      },
      "./conversation": {
        types: "./dist/components/conversation/index.d.ts",
        import: "./dist/components/conversation/index.js",
        require: "./dist/components/conversation/index.cjs",
      },
      "./settings": {
        types: "./dist/components/settings/index.d.ts",
        import: "./dist/components/settings/index.js",
        require: "./dist/components/settings/index.cjs",
      },
      "./terminal": {
        types: "./dist/components/terminal/index.d.ts",
        import: "./dist/components/terminal/index.js",
        require: "./dist/components/terminal/index.cjs",
      },
      "./i18n": {
        types: "./dist/i18n/index.d.ts",
        import: "./dist/i18n/index.js",
        require: "./dist/i18n/index.cjs",
      },
    });
  });

  it("uses local dev commands without Docker", () => {
    expect(packageJson.scripts.dev).toBe(
      "node --env-file-if-exists=.env scripts/dev-with-automation.mjs",
    );
    expect(packageJson.scripts["dev:static"]).toBe(
      "node --env-file-if-exists=.env scripts/dev-static.mjs",
    );
    expect(packageJson.scripts["dev:minimal"]).toBe(
      "node --env-file-if-exists=.env scripts/dev-safe.mjs",
    );
    expect(packageJson.scripts["dev:docker"]).toBeUndefined();
    expect(packageJson.scripts["dev:docker:dynamic"]).toBeUndefined();
    expect(packageJson.scripts["dev:dangerously-dockerless"]).toBeUndefined();
  });
});
