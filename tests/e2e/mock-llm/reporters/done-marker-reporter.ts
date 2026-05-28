/**
 * Custom Playwright reporter that writes a marker file when all tests
 * complete — before webServer teardown starts.
 *
 * This lets the CI wrapper detect test completion and kill the hanging
 * teardown process immediately, instead of waiting for a timeout.
 *
 * Marker files are written to a `.mock-llm-markers/` directory at the
 * project root — intentionally outside Playwright's `outputDir`
 * (`test-results-mock-llm/`) to avoid being cleaned up.
 *
 * Written markers:
 *   .tests-done  — always written; content is "passed" or "failed"
 *   .all-passed  — written only when all tests passed
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { FullResult, Reporter } from "@playwright/test/reporter";

// Resolve relative to the project root (4 levels up from this file's dir)
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MARKER_DIR = join(PROJECT_ROOT, ".mock-llm-markers");

class DoneMarkerReporter implements Reporter {
  onEnd(result: FullResult) {
    try {
      mkdirSync(MARKER_DIR, { recursive: true });
      writeFileSync(join(MARKER_DIR, ".tests-done"), result.status);
      if (result.status === "passed") {
        writeFileSync(join(MARKER_DIR, ".all-passed"), "1");
      }
    } catch (err) {
      // Don't crash Playwright if marker write fails
      console.error("[DoneMarkerReporter] Failed to write markers:", err);
    }
  }
}

export default DoneMarkerReporter;
