import { describe, expect, it, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModelSelector } from "#/components/shared/modals/settings/model-selector";
import { server } from "#/mocks/node";

describe("ModelSelector — OpenHands provider display", () => {
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
        return HttpResponse.json({
          providers: ["openhands", "anthropic", "openai"],
        });
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

  it("shows OpenHands as the provider for a legacy litellm_proxy/<m> + All-Hands proxy base URL, fetching each LLM endpoint exactly once", async () => {
    // Arrange — mirrors pre-#3548 persisted settings that stored the LiteLLM
    // proxy transport model instead of the public OpenHands provider model.
    renderWithQuery(
      <ModelSelector
        currentModel="litellm_proxy/claude-opus-4-7"
        currentBaseUrl="https://llm-proxy.app.all-hands.dev/"
      />,
    );

    // Act / Assert — the legacy bootstrap path must wait for the openhands
    // verified list to load before resolving the displayed provider.
    await waitFor(() => {
      expect(screen.getByLabelText("LLM$PROVIDER")).toHaveValue("OpenHands");
    });

    expect(providersCount).toBe(1);
    expect(verifiedCount).toBe(1);
    expect(modelsCount).toBe(1);
  });

  it("shows OpenHands immediately for current openhands/<m> settings", async () => {
    renderWithQuery(<ModelSelector currentModel="openhands/claude-opus-4-7" />);

    await waitFor(() => {
      expect(screen.getByLabelText("LLM$PROVIDER")).toHaveValue("OpenHands");
    });

    expect(providersCount).toBe(1);
    expect(verifiedCount).toBe(1);
    expect(modelsCount).toBe(1);
  });
});
