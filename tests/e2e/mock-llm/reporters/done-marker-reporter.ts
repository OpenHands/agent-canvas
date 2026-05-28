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
import { join } from "node:path";
import type { FullResult, Reporter } from "@playwright/test/reporter";

// Playwright runs from the project root (where the config file lives).
const MARKER_DIR = join(process.cwd(), ".mock-llm-markers");

class DoneMarkerReporter implements Reporter {
  onBegin() {
    console.log(`[DoneMarkerReporter] Active, markers → ${MARKER_DIR}`);
  }

  onEnd(result: FullResult) {
    console.log(`[DoneMarkerReporter] onEnd: ${result.status}`);
    try {
      mkdirSync(MARKER_DIR, { recursive: true });
      writeFileSync(join(MARKER_DIR, ".tests-done"), result.status);
      if (result.status === "passed") {
        writeFileSync(join(MARKER_DIR, ".all-passed"), "1");
      }
      console.log(`[DoneMarkerReporter] Markers written to ${MARKER_DIR}`);
    } catch (err) {
      console.error("[DoneMarkerReporter] Failed to write markers:", err);
    }
  }
}

export default DoneMarkerReporter;
