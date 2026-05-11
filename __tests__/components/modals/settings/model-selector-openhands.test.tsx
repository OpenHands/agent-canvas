import { describe, expect, it, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModelSelector } from "#/components/shared/modals/settings/model-selector";
import { server } from "#/mocks/node";

describe("ModelSelector — OpenHands round-trip", () => {
  let providersCount = 0;
  let verifiedCount = 0;
  let modelsCount = 0;

  beforeEach(() => {
    providersCount = 0;
    verifiedCount = 0;
    modelsCount = 0;
    // Use "*" prefix to match both relative paths and absolute URLs (e.g.,
    // http://127.0.0.1:8000/api/...) when VITE_BACKEND_BASE_URL is configured.
    server.use(
      http.get("*/api/llm/providers", () => {
        providersCount += 1;
        return HttpResponse.json({ providers: ["anthropic", "openai"] });
      }),
      http.get("*/api/llm/models/verified", () => {
        verifiedCount += 1;
        return HttpResponse.json({
          models: {
            openhands: ["claude-opus-4-7"],
            anthropic: ["claude-opus-4-5-20251101"],
          },
        });
      }),
      http.get("*/api/llm/models", () => {
        modelsCount += 1;
        return HttpResponse.json({ models: [] });
      }),
    );
  });

  function renderWithQuery(ui: React.ReactElement) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  }

  it("shows OpenHands as the provider for a persisted litellm_proxy/<m> + All-Hands proxy base URL, fetching each LLM endpoint exactly once", async () => {
    // Arrange — mirrors the post-save state: the SDK rewrote openhands/<m>
    // to litellm_proxy/<m> on disk and pinned the All-Hands proxy base URL.
    renderWithQuery(
      <ModelSelector
        currentModel="litellm_proxy/claude-opus-4-7"
        currentBaseUrl="https://llm-proxy.app.all-hands.dev/"
      />,
    );

    // Act / Assert — the bootstrap effect must wait for the openhands
    // verified list to load before resolving the displayed provider.
    await waitFor(() => {
      expect(screen.getByLabelText("LLM$PROVIDER")).toHaveValue("OpenHands");
    });

    // Assert — the three queries that all need verified-models data share
    // a single cache entry, and the bootstrap effect picks the right
    // provider on its first run, so /models is not fetched twice.
    expect(providersCount).toBe(1);
    expect(verifiedCount).toBe(1);
    expect(modelsCount).toBe(1);
  });
});
