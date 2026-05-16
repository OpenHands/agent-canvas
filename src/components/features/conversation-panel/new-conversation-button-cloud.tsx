import React from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

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
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";

interface CloudNewConversationButtonProps {
  /**
   * Render the trigger as a "+" icon-only button (used by the collapsed
   * sidebar). The popover content is unchanged; only the trigger pill
   * collapses.
   */
  compact?: boolean;
}

interface RepoListItemProps {
  repo: GitRepository;
  disabled: boolean;
  onSelect: (repo: GitRepository) => void;
  itemClass: string;
}

function RepoListItem({
  repo,
  disabled,
  onSelect,
  itemClass,
}: RepoListItemProps) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        data-testid="launch-repository"
        data-repo-name={repo.full_name}
        onClick={() => onSelect(repo)}
        className={itemClass}
      >
        <RepoIcon width={14} height={14} className="shrink-0" />
        <span className="truncate">{repo.full_name}</span>
      </button>
    </li>
  );
}

/**
 * Cloud-backend variant of the sidebar "+ New Conversation" trigger.
 *
 * Lists git repositories (filtered by an optional search query) from the
 * active provider. Clicking a row immediately launches a conversation
 * against the repo's default branch (falling back to "main"). No branch
 * picker is exposed — the user can switch branches from inside the
 * conversation once it's running.
 */
export function CloudNewConversationButton({
  compact = false,
}: CloudNewConversationButtonProps = {}) {
  const { t } = useTranslation("openhands");
  const { navigate } = useNavigation();

  const { providers } = useUserProviders();
  const { lastSelectedProvider, setLastSelectedProvider } = useHomeStore();

  const [open, setOpen] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement>(null);
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

  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const launchRepository = (repo: GitRepository) => {
    if (isCreating) return;
    createConversation(
      {
        repository: {
          name: repo.full_name,
          gitProvider: repo.git_provider,
          branch: repo.main_branch ?? "main",
        },
      },
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
    "flex items-center gap-2 w-full px-2 py-2 text-sm text-white text-left cursor-pointer",
    "hover:bg-[var(--oh-interactive-hover)] rounded-md transition-colors duration-150 font-normal",
    "disabled:opacity-60 disabled:cursor-not-allowed",
  );

  // When the popover is open and the active provider has very few repos
  // available, auto-load the next page so users can scroll without
  // explicitly clicking "Load more".
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

  const isListLoading = debouncedQuery ? isSearchLoading : isLoading;
  const showLoadMore =
    !debouncedQuery && hasNextPage && repositories.length > 0;

  const newConversationLabel = t(I18nKey.SIDEBAR$NEW_CONVERSATION);

  const triggerButton = (
    <button
      type="button"
      data-testid="new-conversation-button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-label={compact ? newConversationLabel : undefined}
      className={cn(
        "flex items-center rounded-md cursor-pointer transition-colors",
        "text-sm font-medium text-white bg-[var(--oh-surface)]/60 hover:bg-[var(--oh-surface-raised)]",
        "border border-[var(--oh-border)]",
        compact
          ? "justify-center w-10 h-10 p-0 mx-auto"
          : "gap-1.5 w-full px-3 py-2",
      )}
    >
      <Plus width={16} height={16} className="shrink-0" />
      {!compact && newConversationLabel}
    </button>
  );

  return (
    <div
      className={cn("relative", compact && "flex justify-center")}
      ref={popoverRef}
    >
      {compact ? (
        <StyledTooltip content={newConversationLabel} placement="right">
          {triggerButton}
        </StyledTooltip>
      ) : (
        triggerButton
      )}

      {open && (
        <div
          data-testid="new-conversation-popover"
          className={cn(
            "absolute z-30 top-full mt-2 p-1",
            "bg-[var(--oh-surface)] border border-[var(--oh-border-input)] rounded-lg shadow-xl",
            "flex flex-col gap-1",
            compact ? "left-0 w-[260px]" : "left-0 right-0",
          )}
        >
          {providers.length > 1 && (
            <div
              className="flex items-center gap-1 px-1 pt-1"
              data-testid="cloud-provider-tabs"
            >
              {providers.map((provider) => {
                const isActive = provider === selectedProvider;
                return (
                  <button
                    key={provider}
                    type="button"
                    data-testid={`cloud-provider-tab-${provider}`}
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

          <div className="px-1">
            <input
              type="text"
              data-testid="cloud-repo-search-input"
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

          <ul className="flex flex-col max-h-[40vh] sm:max-h-[280px] overflow-y-auto">
            {isListLoading && repositories.length === 0 && (
              <li
                className="px-2 py-2 text-sm text-[var(--oh-muted)] italic"
                data-testid="cloud-repo-loading"
              >
                {t(I18nKey.HOME$LOADING_REPOSITORIES)}
              </li>
            )}
            {isError && (
              <li
                className="px-2 py-2 text-sm text-[#F87171]"
                data-testid="cloud-repo-error"
              >
                {t(I18nKey.HOME$FAILED_TO_LOAD_REPOSITORIES)}
              </li>
            )}
            {!isListLoading &&
              !isError &&
              repositories.length === 0 &&
              !!selectedProvider && (
                <li
                  className="px-2 py-2 text-sm text-[var(--oh-muted)] italic"
                  data-testid="cloud-repo-empty"
                >
                  {t(I18nKey.GITHUB$NO_RESULTS)}
                </li>
              )}
            {repositories.map((repo) => (
              <RepoListItem
                key={`${repo.git_provider}:${repo.id}`}
                repo={repo}
                disabled={isCreating}
                onSelect={launchRepository}
                itemClass={itemClass}
              />
            ))}
            {showLoadMore && (
              <li>
                <button
                  type="button"
                  data-testid="cloud-repo-load-more"
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
