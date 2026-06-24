import type { AppConversation } from "#/api/conversation-service/agent-server-conversation-service.types";

/**
 * Project scoping (Bet C) — a long-lived node that groups conversations across
 * repos under one named project, decoupled from any single repo. v1 lives
 * entirely in the cockpit: a project is a row in a per-browser registry
 * ({@link ProjectRegistry}) plus a `project` tag stamped on conversations at
 * launch. The slug is the permanent join key — mapped 1:1 to the Hermes board
 * slug so both surfaces share one project namespace (see
 * `.context/research/project-scoping.md`).
 *
 * Like owner/source, project is advisory: it organizes the firehose, it does
 * not enforce anything (the local backend has no per-user identity). Pure (no
 * React/store) so `slugify`/`parse`/`deriveFilterOptions` are unit-tested
 * directly.
 */

export interface Project {
  /**
   * Stable, validator-safe identity (kebab-case). The join key to Hermes and
   * the value stamped into `tags.project`. Derived from {@link Project.slugify}
   * at creation; never re-derived from a renamed display name, so a rename
   * can't silently split the namespace.
   */
  slug: string;
  /** Human-facing display name. */
  name: string;
  /**
   * Repos linked to this project (`owner/repo` in cloud, workspace folders in
   * local). v1 metadata only — displayed, not enforced. Per-browser, so never
   * treat as authoritative cross-user truth (that's the v2 entity trigger).
   */
  repos: string[];
  /** Advisory creator identity (email), or null when unknown. */
  createdBy: string | null;
}

/** Input to {@link Project.parse} — a raw, unvalidated project draft. */
export interface ProjectInput {
  name: string;
  repos?: string[];
  createdBy?: string | null;
}

/** Sentinel for the "no project scope" filter selection. */
export const PROJECT_FILTER_ALL = "all";

/** A selectable project in the filter facet. Mirrors `RepoFilterOption`. */
export interface ProjectFilterOption {
  /** Project slug — the filter value and the value present in `tags.project`. */
  slug: string;
  /** Registry display name, falling back to the slug when not in the registry. */
  label: string;
  /** Conversations currently carrying this slug (0 for empty registry rows). */
  count: number;
  /** Whether a registry row exists locally (false ⇒ a Hermes/foreign slug). */
  inRegistry: boolean;
}

// Combining diacritical marks left behind after NFKD decomposition (é → e +
// U+0301). Stripping them keeps accented names producing readable ASCII slugs
// ("Café" → "cafe") instead of dropping the letter ("caf").
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
const NON_SLUG_RUN = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

export const Project = {
  /**
   * Normalize an arbitrary name into a validator-safe kebab-case slug:
   * lowercase, accents folded to ASCII, every run of non-`[a-z0-9]`
   * collapsed to a single hyphen, no leading/trailing hyphens. Idempotent.
   * Returns "" when the input has no alphanumeric content (caller rejects).
   *
   * The agent-server tag validator constrains tag *keys* to `^[a-z0-9]+$`;
   * *values* are opaque (the shipped `owner` tag carries emails). This slug
   * shape is deliberately stricter than required so the value is safe
   * regardless, and so it round-trips identically through Hermes.
   */
  slugify(input: string): string {
    return input
      .normalize("NFKD")
      .replace(COMBINING_MARKS, "")
      .toLowerCase()
      .replace(NON_SLUG_RUN, "-")
      .replace(EDGE_HYPHENS, "");
  },

  /**
   * Parse a raw draft into a {@link Project}, or null when invalid (blank name,
   * or a name with no alphanumeric content so the slug would be empty). Trims
   * and de-dupes repos preserving order.
   */
  parse(input: ProjectInput): Project | null {
    const name = input.name.trim();
    if (!name) return null;

    const slug = Project.slugify(name);
    // Reject the empty slug (no alphanumeric content) and the reserved
    // PROJECT_FILTER_ALL sentinel — a project slugged "all" would be
    // indistinguishable from the "no scope / stamp nothing" selection.
    if (!slug || slug === PROJECT_FILTER_ALL) return null;

    const repos = [
      ...new Set(
        (input.repos ?? []).map((repo) => repo.trim()).filter(Boolean),
      ),
    ];

    return {
      slug,
      name,
      repos,
      createdBy: input.createdBy?.trim() || null,
    };
  },

  /**
   * The filter facet's options: every registry project UNION every distinct
   * slug present on the conversations, keyed by slug. Registry projects with
   * zero conversations are kept (count 0) so a freshly-created project is
   * immediately selectable to launch into; a foreign slug with no registry row
   * still shows (labeled by its slug) so Hermes-stamped sessions remain
   * filterable. Sorted by label for stable display.
   */
  deriveFilterOptions(
    registry: readonly Project[],
    conversations: readonly Pick<AppConversation, "project">[],
  ): ProjectFilterOption[] {
    const counts = new Map<string, number>();
    for (const conversation of conversations) {
      const slug = conversation.project?.trim();
      if (!slug) continue;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }

    const nameBySlug = new Map(registry.map((p) => [p.slug, p.name]));
    const slugs = new Set<string>([
      ...registry.map((p) => p.slug),
      ...counts.keys(),
    ]);
    // Defense-in-depth: a foreign/Hermes conversation literally tagged
    // `project: "all"` must never surface as a selectable option, or it would
    // masquerade as the PROJECT_FILTER_ALL sentinel.
    slugs.delete(PROJECT_FILTER_ALL);

    return [...slugs]
      .map((slug) => ({
        slug,
        label: nameBySlug.get(slug) ?? slug,
        count: counts.get(slug) ?? 0,
        inRegistry: nameBySlug.has(slug),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  },
} as const;
