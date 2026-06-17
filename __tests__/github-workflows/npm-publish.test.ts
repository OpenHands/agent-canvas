// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf-8");
}

describe("npm publish workflow", () => {
  it("builds the packaged static app with production PostHog configuration", () => {
    const workflow = read(".github/workflows/npm-publish.yml");
    const buildAppStep = workflow.match(
      /- name: Build app[\s\S]*?(?=\n\s*- name: Build library)/,
    )?.[0];

    expect(buildAppStep).toBeTruthy();
    expect(buildAppStep).toContain("VITE_APP_ENV: production");
    expect(buildAppStep).toContain(
      "VITE_POSTHOG_CLIENT_KEY: ${{ vars.POSTHOG_PROD_KEY }}",
    );
    expect(buildAppStep).toContain("npm run build");
  });
});
