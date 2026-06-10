import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WORKING_DIR,
  buildConversationWorkingDir,
  getAgentServerBaseUrl,
  getAgentServerFormDefaults,
  getAgentServerSessionApiKey,
  getAgentServerWorkingDir,
  isAuthRequired,
  isAuthRequiredAndMissing,
} from "#/api/agent-server-config";

const ORIGINAL_LOCATION = window.location;

function mockWindowLocation(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url),
  });
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  delete (window as unknown as Record<string, unknown>)
    .__AGENT_CANVAS_SESSION_API_KEY__;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
});

describe("agent server config", () => {
  it("uses VITE_BACKEND_BASE_URL when it is provided", () => {
    mockWindowLocation("https://work-1.example.dev/settings");
    vi.stubEnv("VITE_BACKEND_BASE_URL", "https://agent.example.com/");

    expect(getAgentServerBaseUrl()).toBe("https://agent.example.com");
  });

  it("uses the browser origin when no backend URL is configured", () => {
    mockWindowLocation("https://work-1.example.dev/settings");

    expect(getAgentServerBaseUrl()).toBe("https://work-1.example.dev");
  });

  it("canonicalizes 127.0.0.1 loopback backend URLs to localhost", () => {
    mockWindowLocation("https://work-1.example.dev/settings");
    vi.stubEnv("VITE_BACKEND_BASE_URL", "http://127.0.0.1:8000");

    expect(getAgentServerBaseUrl()).toBe("http://localhost:8000");
  });

  it("prefills the settings form from environment defaults", () => {
    vi.stubEnv("VITE_BACKEND_BASE_URL", "https://env-agent.example.com/");
    vi.stubEnv("VITE_SESSION_API_KEY", "env-session-key");

    expect(getAgentServerFormDefaults()).toEqual({
      baseUrl: "https://env-agent.example.com",
      sessionApiKey: "env-session-key",
    });
    expect(getAgentServerSessionApiKey()).toBe("env-session-key");
  });

  it("defaults the working dir to the relative workspace path", () => {
    expect(getAgentServerWorkingDir()).toBe(DEFAULT_WORKING_DIR);
  });

  it("nests each conversation's working dir under the configured base using the hex id", () => {
    vi.stubEnv("VITE_WORKING_DIR", "/srv/workspaces/");

    expect(
      buildConversationWorkingDir("4a8dca37-3bf0-48de-a0af-949d711c3d48"),
    ).toBe("/srv/workspaces/4a8dca373bf048dea0af949d711c3d48");
  });

});

describe("isAuthRequired", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_AUTH_REQUIRED__;
  });

  it("returns false when neither env var nor window flag is set", () => {
    expect(isAuthRequired()).toBe(false);
  });

  it("returns true when VITE_AUTH_REQUIRED is 'true'", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "true");
    expect(isAuthRequired()).toBe(true);
  });

  it("returns true when window.__AGENT_CANVAS_AUTH_REQUIRED__ is set", () => {
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_AUTH_REQUIRED__ = true;
    expect(isAuthRequired()).toBe(true);
  });

  it("returns false when window flag is a non-true value", () => {
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_AUTH_REQUIRED__ = "true";
    expect(isAuthRequired()).toBe(false);
  });
});

describe("isAuthRequiredAndMissing", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)
      .__AGENT_CANVAS_AUTH_REQUIRED__;
  });

  it("returns false when VITE_AUTH_REQUIRED is not set", () => {
    expect(isAuthRequiredAndMissing()).toBe(false);
  });

  it("returns true when VITE_AUTH_REQUIRED is true and no key is baked in", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "true");
    vi.stubEnv("VITE_SESSION_API_KEY", "");

    expect(isAuthRequiredAndMissing()).toBe(true);
  });

  it("returns true via window flag when no key is baked in", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_AUTH_REQUIRED__ = true;

    expect(isAuthRequiredAndMissing()).toBe(true);
  });

  it("returns false when VITE_AUTH_REQUIRED is true but VITE_SESSION_API_KEY is baked in", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "true");
    vi.stubEnv("VITE_SESSION_API_KEY", "baked-key");

    expect(isAuthRequiredAndMissing()).toBe(false);
  });

  it("returns false for non-'true' values of VITE_AUTH_REQUIRED", () => {
    vi.stubEnv("VITE_AUTH_REQUIRED", "false");

    expect(isAuthRequiredAndMissing()).toBe(false);
  });
});

// Covers the published `agent-canvas` binary path: the prebuilt bundle has
// no VITE_SESSION_API_KEY baked in, but `scripts/static-server.mjs` injects
// the runtime key into `window.__AGENT_CANVAS_SESSION_API_KEY__`. Without
// this fallback, `makeDefaultLocalBackend()` returns null on a fresh install
// and the user sees the Manage Backends modal instead of the onboarding flow.
describe("getAgentServerSessionApiKey runtime-injection fallback", () => {
  function setInjectedKey(value: unknown) {
    (
      window as unknown as Record<string, unknown>
    ).__AGENT_CANVAS_SESSION_API_KEY__ = value;
  }

  it("returns the env-baked key when VITE_SESSION_API_KEY is set", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "env-key");
    setInjectedKey("window-key");

    expect(getAgentServerSessionApiKey()).toBe("env-key");
  });

  it("falls back to the runtime-injected window global when no env key is baked in", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    setInjectedKey("runtime-injected-key");

    expect(getAgentServerSessionApiKey()).toBe("runtime-injected-key");
  });

  it("includes the injected key in form defaults so the registry can seed", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    setInjectedKey("runtime-injected-key");

    expect(getAgentServerFormDefaults().sessionApiKey).toBe(
      "runtime-injected-key",
    );
  });

  it("returns null when neither env nor window provides a key", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "");

    expect(getAgentServerSessionApiKey()).toBeNull();
  });

  it("treats a whitespace-only injected key as missing", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    setInjectedKey("   ");

    expect(getAgentServerSessionApiKey()).toBeNull();
  });

  it("ignores non-string injected values", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "");
    setInjectedKey(12345);

    expect(getAgentServerSessionApiKey()).toBeNull();
  });
});
