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
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

// Playwright runs from the project root (where the config file lives).
const MARKER_DIR = join(process.cwd(), ".mock-llm-markers");

interface TestRecord {
  title: string;
  status: string;
  durationMs: number;
  error: string;
}

/**
 * Tracks test results and writes markers at the earliest possible moment.
 *
 * Playwright lifecycle: onBegin → tests → onTestEnd (each) → onEnd → cleanup.
 * The webServer teardown happens during "cleanup", which can hang indefinitely.
 * `onEnd()` fires AFTER teardown, so it's too late.
 *
 * Instead, we write the `.tests-done` marker in `onTestEnd()` after the LAST
 * test completes. For a single-test suite this fires immediately after the
 * test finishes, before any webServer teardown begins.
 *
 * Also writes `.results.json` with per-test timing/error data so the report
 * script can render accurate durations (Playwright's own results.json only
 * flushes on clean exit, which never happens when teardown hangs).
 */
class DoneMarkerReporter implements Reporter {
  private totalTests = 0;
  private completedTests = 0;
  private allPassed = true;
  private tests: TestRecord[] = [];

  onBegin(_config: unknown, suite: { allTests(): TestCase[] }) {
    this.totalTests = suite.allTests().length;
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.completedTests++;
    const passed = result.status === "passed" || result.status === "skipped";
    if (!passed) {
      this.allPassed = false;
    }

    this.tests.push({
      title: test.titlePath().filter(Boolean).join(" › "),
      status: result.status,
      durationMs: result.duration,
      error: result.errors
        .map((e) => e.message ?? "")
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 1500),
    });

    // Write markers after the last test completes.
    if (this.completedTests >= this.totalTests) {
      this.writeMarkers();
    }
  }

  onEnd(_result: FullResult) {
    // Fallback: write markers here too in case onTestEnd didn't fire
    // (e.g., if Playwright exits before running any tests).
    // If zero tests ran (webServer timeout, config error, etc.), treat
    // that as a failure — "0 tests passed" is not a meaningful pass.
    if (this.totalTests === 0 || this.completedTests === 0) {
      this.allPassed = false;
    }
    this.writeMarkers();
  }

  private writeMarkers() {
    const status = this.allPassed ? "passed" : "failed";
    try {
      mkdirSync(MARKER_DIR, { recursive: true });
      writeFileSync(join(MARKER_DIR, ".tests-done"), status);
      if (this.allPassed) {
        writeFileSync(join(MARKER_DIR, ".all-passed"), "1");
      }
      writeFileSync(
        join(MARKER_DIR, ".results.json"),
        JSON.stringify({ status, tests: this.tests }),
      );
    } catch {
      // Don't crash Playwright if marker write fails
    }
  }
}

export default DoneMarkerReporter;
