import { http, HttpResponse, delay } from "msw";
import type {
  Automation,
  AutomationsResponse,
  AutomationRun,
  AutomationRunsResponse,
} from "#/types/automation";
import { AutomationRunStatus } from "#/types/automation";
import { MOCK_AUTOMATIONS_RESPONSE } from "./automations.mock";
import { MOCK_AUTOMATION_RUNS } from "./automation-runs.mock";

// Mutable copy for CRUD operations within the mock session
const automations = new Map<string, Automation>(
  MOCK_AUTOMATIONS_RESPONSE.automations.map((a) => [a.id, { ...a }]),
);

export const resetAutomationMockData = () => {
  automations.clear();
  MOCK_AUTOMATIONS_RESPONSE.automations.forEach((a) => {
    automations.set(a.id, { ...a });
  });
};

export const AUTOMATION_HANDLERS = [
  // GET /api/automation/health — Health check
  http.get("*/api/automation/health", async () => {
    await delay(100);
    return HttpResponse.json({ status: "ok" });
  }),

  // GET /api/automation/v1 — List automations
  http.get("*/api/automation/v1", async ({ request }) => {
    await delay(300);

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const offset = Number(url.searchParams.get("offset") ?? "0");

    const all = Array.from(automations.values());
    const page = all.slice(offset, offset + limit);

    const response: AutomationsResponse = {
      automations: page,
      total: all.length,
    };

    return HttpResponse.json(response);
  }),

  // GET /api/automation/v1/:id/runs — List automation runs
  http.get("*/api/automation/v1/:id/runs", async ({ params, request }) => {
    await delay(200);

    const id = params.id as string;
    if (!automations.has(id)) {
      return HttpResponse.json(
        { detail: "Automation not found" },
        { status: 404 },
      );
    }

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const offset = Number(url.searchParams.get("offset") ?? "0");

    const allRuns = MOCK_AUTOMATION_RUNS[id] ?? [];
    const page = allRuns.slice(offset, offset + limit);

    const response: AutomationRunsResponse = {
      runs: page,
      total: allRuns.length,
    };

    return HttpResponse.json(response);
  }),

  // GET /api/automation/v1/:id — Get automation detail
  http.get("*/api/automation/v1/:id", async ({ params }) => {
    await delay(200);

    const automation = automations.get(params.id as string);
    if (!automation) {
      return HttpResponse.json(
        { detail: "Automation not found" },
        { status: 404 },
      );
    }

    return HttpResponse.json(automation);
  }),

  // PATCH /api/automation/v1/:id — Update automation (toggle enabled)
  http.patch("*/api/automation/v1/:id", async ({ params, request }) => {
    await delay(200);

    const id = params.id as string;
    // Clone the request before reading the body to avoid "Body has already been read" errors
    // when MSW internally consumes the body during handler resolution.
    const body = (await request.clone().json()) as Partial<Automation>;
    const automation = automations.get(id);
    if (!automation) {
      return HttpResponse.json(
        { detail: "Automation not found" },
        { status: 404 },
      );
    }

    const updated: Automation = {
      ...automation,
      ...body,
      updated_at: new Date().toISOString(),
    };
    automations.set(id, updated);

    return HttpResponse.json(updated);
  }),

  // POST /api/automation/v1/:id/dispatch — Manually trigger a run
  http.post("*/api/automation/v1/:id/dispatch", async ({ params }) => {
    await delay(200);

    const id = params.id as string;
    const automation = automations.get(id);
    if (!automation) {
      return HttpResponse.json(
        { detail: "Automation not found" },
        { status: 404 },
      );
    }

    const run: AutomationRun = {
      id: crypto.randomUUID(),
      status: AutomationRunStatus.PENDING,
      conversation_id: null,
      bash_command_id: null,
      error_detail: null,
      started_at: new Date().toISOString(),
      completed_at: null,
    };

    return HttpResponse.json(run, { status: 201 });
  }),

  // POST /api/automation/v1/runs/:runId/cancel — Cancel a run
  http.post("*/api/automation/v1/runs/:runId/cancel", async ({ params }) => {
    await delay(200);

    const runId = params.runId as string;

    // Find the run across all automations
    for (const [, runs] of Object.entries(MOCK_AUTOMATION_RUNS)) {
      const run = runs.find((r) => r.id === runId);
      if (run) {
        if (
          run.status !== AutomationRunStatus.PENDING &&
          run.status !== AutomationRunStatus.RUNNING
        ) {
          return HttpResponse.json(
            {
              detail: `Run is ${run.status}, only PENDING or RUNNING runs can be cancelled`,
            },
            { status: 409 },
          );
        }

        run.status = AutomationRunStatus.CANCELLED;
        run.error_detail = "Cancelled by user";
        run.completed_at = new Date().toISOString();

        return HttpResponse.json(run);
      }
    }

    return HttpResponse.json({ detail: "Run not found" }, { status: 404 });
  }),

  // DELETE /api/automation/v1/:id — Delete automation
  http.delete("*/api/automation/v1/:id", async ({ params }) => {
    await delay(200);

    const id = params.id as string;
    if (!automations.has(id)) {
      return HttpResponse.json(
        { detail: "Automation not found" },
        { status: 404 },
      );
    }

    automations.delete(id);
    return new HttpResponse(null, { status: 204 });
  }),
];
