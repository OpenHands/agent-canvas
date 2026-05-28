/**
 * Custom Playwright reporter that writes a marker file when all tests
 * complete — before webServer teardown starts.
 *
 * This lets the CI wrapper detect test completion and kill the hanging
 * teardown process immediately, instead of waiting for a timeout.
 *
 * Written markers:
 *   .tests-done  — always written; content is "passed" or "failed"
 *   .all-passed  — written only when all tests passed
 */

import { mkdirSync, writeFileSync } from "node:fs";
import type { FullResult, Reporter } from "@playwright/test/reporter";

const OUTPUT_DIR = "test-results-mock-llm";

class DoneMarkerReporter implements Reporter {
  onEnd(result: FullResult) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(`${OUTPUT_DIR}/.tests-done`, result.status);
    if (result.status === "passed") {
      writeFileSync(`${OUTPUT_DIR}/.all-passed`, "1");
    }
  }
}

export default DoneMarkerReporter;
