import type { SkillInfo } from "#/types/settings";
import { getActiveBackend } from "../backend-registry/active-store";
import type { Backend } from "../backend-registry/types";
import { callCloudProxy } from "./proxy";

interface CloudSkillsPage {
  items: SkillInfo[];
  next_page_id: string | null;
}

const PAGE_LIMIT = 100;

function getActiveCloudBackend(): Backend {
  const active = getActiveBackend().backend;
  if (active.kind !== "cloud") {
    throw new Error("Cloud skills call requires a cloud backend.");
  }
  return active;
}

/**
 * Fetch the full list of skills from the cloud SaaS via the bundled
 * /api/cloud-proxy. The cloud endpoint is paginated (page_id cursor); we
 * walk all pages so the settings UI gets a complete list in one call. The
 * cloud SkillInfo shape (name/type/source/triggers) matches the GUI's
 * SkillInfo type, so items are passed through unchanged.
 */
export async function fetchCloudSkills(): Promise<SkillInfo[]> {
  const backend = getActiveCloudBackend();

  const fetchPage = async (
    pageId: string | null = null,
  ): Promise<SkillInfo[]> => {
    const query = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (pageId) query.set("page_id", pageId);

    const page = await callCloudProxy<CloudSkillsPage>({
      backend,
      method: "GET",
      path: `/api/v1/skills/search?${query.toString()}`,
    });

    const items = page.items ?? [];
    if (!page.next_page_id) {
      return items;
    }

    return [...items, ...(await fetchPage(page.next_page_id))];
  };

  return fetchPage();
}
