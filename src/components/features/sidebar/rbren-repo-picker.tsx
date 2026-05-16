/**
 * rbren's mod: fork-local sidebar widget.
 *
 * Cloud-mode counterpart of `rbren-workspace-picker.tsx`. Renders the same
 * outline-bordered chevron-down trigger button next to the "Code" nav link
 * in the left sidebar, but opens a popover listing **git repositories**
 * (filtered by provider + optional search query) instead of local
 * workspaces. Selecting a repo immediately starts a new conversation
 * against that repo's default branch and navigates to it.
 *
 * Composition pattern modeled after
 * `components/features/conversation-panel/new-conversation-button-cloud.tsx`
 * (same `useGitRepositories` + `useSearchRepositories` + `useUserProviders`
 * + `useCreateConversation` + `useNavigation` set). This is intentionally
 * separate so the fork-local sidebar tweak can be retired by deleting this
 * file alongside `rbren-workspace-picker.tsx` and the wrapping div in
 * `sidebar.tsx`.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";

import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useNavigation } from "#/context/navigation-context";
import { useIsCreatingConversation } from "#/hooks/use-is-creating-conversation";
import { useGitRepositories } from "#/hooks/query/use-git-repositories";
import { useSearchRepositories } from "#/hooks/query/use-search-repositories";
import { useUserProviders } from "#/hooks/use-user-providers";
import { useDebounce } from "#/hooks/use-debounce";
import { useHomeStore } from "#/stores/home-store";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { GitRepository } from "#/types/git";
import { Provider } from "#/types/settings";
import RepoIcon from "#/icons/repo.svg?react";
import { GitProviderIcon } from "#/components/shared/git-provider-icon";

interface RbrenRepoPickerProps {
  /** Hide the picker entirely when the sidebar is collapsed to a 64px rail. */
  collapsed: boolean;
}

export function RbrenRepoPicker({ collapsed }: RbrenRepoPickerProps) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();

  const { providers } = useUserProviders();
  const { lastSelectedProvider, setLastSelectedProvider } = useHomeStore();

  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [selectedProvider, setSelectedProvider] =
    React.useState<Provider | null>(lastSelectedProvider ?? null);
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebounce(query, 300);

  // Auto-select a provider once `useUserProviders` resolves: prefer the
  // previously chosen one if it's still connected, otherwise the first
  // available provider.
  React.useEffect(() => {
    if (providers.length === 0) {
      if (selectedProvider !== null) setSelectedProvider(null);
      return;
    }
    if (selectedProvider && providers.includes(selectedProvider)) return;
    const fallback =
      lastSelectedProvider && providers.includes(lastSelectedProvider)
        ? lastSelectedProvider
        : providers[0];
    setSelectedProvider(fallback);
  }, [providers, selectedProvider, lastSelectedProvider]);

  const {
    data: repoPages,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useGitRepositories({ provider: selectedProvider });

  const { data: searchResults, isLoading: isSearchLoading } =
    useSearchRepositories(debouncedQuery, selectedProvider);

  const allRepositories = React.useMemo(
    () => repoPages?.pages.flatMap((page) => page.items) ?? [],
    [repoPages],
  );

  const repositories = debouncedQuery ? (searchResults ?? []) : allRepositories;

  const { mutate: createConversation, isPending } = useCreateConversation();
  const isCreatingElsewhere = useIsCreatingConversation();
  const isCreating = isPending || isCreatingElsewhere;

  // Outside-click closes the popover.
  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Escape also closes.
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // When the popover is open and the active provider has very few repos
  // available, auto-load the next page so users can scroll without
  // explicitly clicking "Load more". Mirrors the cloud "+ New Conversation"
  // popover behavior.
  React.useEffect(() => {
    if (!open) return;
    if (debouncedQuery) return;
    if (!hasNextPage || isFetchingNextPage || isLoading) return;
    if (repositories.length === 0 || repositories.length >= 10) return;
    fetchNextPage();
  }, [
    open,
    debouncedQuery,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    repositories.length,
    fetchNextPage,
  ]);

  if (collapsed) return null;

  const launch = (repo?: GitRepository) => {
    if (isCreating) return;
    createConversation(
      repo
        ? {
            repository: {
              name: repo.full_name,
              gitProvider: repo.git_provider,
              branch: repo.main_branch ?? "main",
            },
          }
        : {},
      {
        onSuccess: (data) => {
          setOpen(false);
          navigate(`/conversations/${data.conversation_id}`);
        },
      },
    );
  };

  const handleProviderChange = (provider: Provider) => {
    setSelectedProvider(provider);
    setLastSelectedProvider(provider);
    setQuery("");
  };

  const itemClass = cn(
    "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left text-sm",
    "text-white hover:bg-[var(--oh-interactive-hover)] transition-colors",
    "disabled:opacity-60 disabled:cursor-not-allowed",
  );

  const isListLoading = debouncedQuery ? isSearchLoading : isLoading;
  const showLoadMore =
    !debouncedQuery && hasNextPage && repositories.length > 0;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        data-testid="rbren-repo-picker-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Pick repository for new conversation"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md",
          "border border-[var(--oh-border)]",
          "text-[var(--oh-muted)] hover:text-white hover:bg-[var(--oh-surface-raised)]",
          "transition-colors cursor-pointer",
        )}
      >
        <ChevronDown
          width={14}
          height={14}
          className={cn(
            "transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          data-testid="rbren-repo-picker-popover"
          role="menu"
          className={cn(
            // Anchor the popover's left edge to the chevron rather than its
            // right edge — at min-w-[280px] the popover is wider than the
            // sidebar, so anchoring with `right-0` would push it leftward
            // and run it off the left side of the screen. `left-0` lets it
            // float rightward over the main content area instead.
            "absolute z-30 top-full left-0 mt-1 p-1 min-w-[280px]",
            "bg-[var(--oh-surface)] border border-[var(--oh-border-input)]",
            "rounded-lg shadow-xl",
            "flex flex-col",
          )}
        >
          {providers.length > 1 && (
            <div
              className="flex items-center gap-1 px-1 pt-1"
              data-testid="rbren-repo-picker-provider-tabs"
            >
              {providers.map((provider) => {
                const isActive = provider === selectedProvider;
                return (
                  <button
                    key={provider}
                    type="button"
                    data-testid={`rbren-repo-picker-provider-tab-${provider}`}
                    onClick={() => handleProviderChange(provider)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-xs",
                      "border transition-colors",
                      isActive
                        ? "bg-[var(--oh-interactive-hover)] border-[var(--oh-border-input)] text-white"
                        : "border-transparent text-[var(--oh-text-secondary)] hover:text-white",
                    )}
                  >
                    <GitProviderIcon gitProvider={provider} />
                    <span className="capitalize">{provider}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="px-1 pt-1">
            <input
              type="text"
              data-testid="rbren-repo-picker-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(I18nKey.COMMON$SEARCH_REPOSITORIES)}
              disabled={!selectedProvider}
              className={cn(
                "w-full px-2 py-1.5 text-sm rounded-md",
                "bg-[var(--oh-surface)] border border-[var(--oh-border)] text-white",
                "placeholder:text-[var(--oh-muted)] outline-none",
                "focus:border-[var(--oh-border-input)]",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            />
          </div>

          <ul className="flex flex-col max-h-[40vh] overflow-y-auto mt-1">
            <li>
              <button
                type="button"
                role="menuitem"
                disabled={isCreating}
                data-testid="rbren-repo-picker-launch-no-repo"
                onClick={() => launch()}
                className={itemClass}
              >
                <span className="italic text-[var(--oh-muted)]">
                  No repository
                </span>
              </button>
            </li>

            {isListLoading && repositories.length === 0 && (
              <li
                className="px-2 py-1.5 text-sm text-[var(--oh-muted)] italic"
                data-testid="rbren-repo-picker-loading"
              >
                {t(I18nKey.HOME$LOADING_REPOSITORIES)}
              </li>
            )}
            {isError && (
              <li
                className="px-2 py-1.5 text-sm text-[#F87171]"
                data-testid="rbren-repo-picker-error"
              >
                {t(I18nKey.HOME$FAILED_TO_LOAD_REPOSITORIES)}
              </li>
            )}
            {!isListLoading &&
              !isError &&
              repositories.length === 0 &&
              !!selectedProvider && (
                <li
                  className="px-2 py-1.5 text-sm text-[var(--oh-muted)] italic"
                  data-testid="rbren-repo-picker-empty"
                >
                  {t(I18nKey.GITHUB$NO_RESULTS)}
                </li>
              )}
            {repositories.map((repo) => (
              <li key={`${repo.git_provider}:${repo.id}`}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={isCreating}
                  data-testid="rbren-repo-picker-launch-repo"
                  data-repo-name={repo.full_name}
                  title={repo.full_name}
                  onClick={() => launch(repo)}
                  className={itemClass}
                >
                  <RepoIcon width={14} height={14} className="shrink-0" />
                  <span className="truncate">{repo.full_name}</span>
                </button>
              </li>
            ))}
            {showLoadMore && (
              <li>
                <button
                  type="button"
                  data-testid="rbren-repo-picker-load-more"
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                  className={itemClass}
                >
                  <span className="text-[var(--oh-text-secondary)]">
                    {isFetchingNextPage
                      ? t(I18nKey.HOME$LOADING_MORE_REPOSITORIES)
                      : t(I18nKey.CONVERSATION$LOAD_MORE)}
                  </span>
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
