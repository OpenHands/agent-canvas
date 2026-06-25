import { describe, expect, it } from "vitest";

import {
  buildChecksMediaUrl,
  CHECKS_MEDIA_BASE_URL_ENV,
  CHECKS_MEDIA_DIR_ENV,
  loadChecksMediaPublisher,
} from "../../tests/e2e/verified/checks-media-publisher";

describe("loadChecksMediaPublisher", () => {
  it("requires both a filesystem directory and an allowlisted raw URL base", () => {
    expect(
      loadChecksMediaPublisher({
        [CHECKS_MEDIA_DIR_ENV]: "/tmp/checks-media",
      }),
    ).toBeNull();
    expect(
      loadChecksMediaPublisher({
        [CHECKS_MEDIA_BASE_URL_ENV]:
          "https://raw.githubusercontent.com/SpotwiseAI/agent-canvas/media/.checks",
      }),
    ).toBeNull();
    expect(
      loadChecksMediaPublisher({
        [CHECKS_MEDIA_DIR_ENV]: "/tmp/checks-media",
        [CHECKS_MEDIA_BASE_URL_ENV]: "https://media.example/.checks",
      }),
    ).toBeNull();
  });

  it("normalizes the URL base and builds encoded artifact URLs", () => {
    const publisher = loadChecksMediaPublisher({
      [CHECKS_MEDIA_DIR_ENV]: "/tmp/checks-media",
      [CHECKS_MEDIA_BASE_URL_ENV]:
        "https://raw.githubusercontent.com/SpotwiseAI/agent-canvas/media/.checks/",
    });

    expect(publisher).toEqual({
      outputDir: "/tmp/checks-media",
      baseUrl:
        "https://raw.githubusercontent.com/SpotwiseAI/agent-canvas/media/.checks",
    });
    expect(buildChecksMediaUrl(publisher!, "0-run trace.zip")).toBe(
      "https://raw.githubusercontent.com/SpotwiseAI/agent-canvas/media/.checks/0-run%20trace.zip",
    );
  });
});
