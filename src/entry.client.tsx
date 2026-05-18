/**
 * By default, Remix will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.client
 */

import { HydratedRouter } from "react-router/dom";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import {
  AgentServerUIProviders,
  DEFAULT_AGENT_SERVER_ANALYTICS,
} from "./components/providers";
import { waitForI18n } from "./i18n";
import { shouldStartMockWorker } from "./mocks/should-start-mock-worker";

async function prepareApp() {
  await waitForI18n();

  if (shouldStartMockWorker()) {
    const { worker } = await import("./mocks/browser");

    await worker.start({
      onUnhandledRequest: "bypass",
    });

    // Expose a lightweight test helper so Playwright snapshot specs can
    // trigger React Query refetches without a full page.reload() — a reload
    // would re-initialize MSW handler state (e.g. the automations Map) back
    // to its seed values, making it impossible to test empty-list UI states.
    const { queryClient } = await import("./query-client-config");
    (
      window as Window &
        typeof globalThis & {
          __TEST_INVALIDATE_QUERIES__: (queryKey?: unknown[]) => void;
        }
    ).__TEST_INVALIDATE_QUERIES__ = (queryKey?: unknown[]) =>
      void queryClient.invalidateQueries(queryKey ? { queryKey } : undefined);
  }
}

prepareApp().then(() =>
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <AgentServerUIProviders
          analytics={DEFAULT_AGENT_SERVER_ANALYTICS}
          withStyleRoot={false}
        >
          <HydratedRouter />
        </AgentServerUIProviders>
      </StrictMode>,
    );
  }),
);
