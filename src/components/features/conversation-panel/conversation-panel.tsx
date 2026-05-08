import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { useNavigation } from "#/context/navigation-context";
import { usePaginatedConversations } from "#/hooks/query/use-paginated-conversations";
import { useStartTasks } from "#/hooks/query/use-start-tasks";
import { useInfiniteScroll } from "#/hooks/use-infinite-scroll";
import { useDeleteConversation } from "#/hooks/mutation/use-delete-conversation";
import { useUnifiedPauseConversation } from "#/hooks/mutation/use-unified-stop-conversation";
import { ConfirmDeleteModal } from "./confirm-delete-modal";
import { ConfirmStopModal } from "./confirm-stop-modal";
import { LoadingSpinner } from "#/components/shared/loading-spinner";
import { NavigationLink } from "#/components/shared/navigation-link";
import { ExitConversationModal } from "./exit-conversation-modal";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { Provider } from "#/types/settings";
import { useUpdateConversation } from "#/hooks/mutation/use-update-conversation";
import { displaySuccessToast } from "#/utils/custom-toast-handlers";
import { ConversationCard } from "./conversation-card/conversation-card";
import { StartTaskCard } from "./start-task-card/start-task-card";
import { ConversationCardSkeleton } from "./conversation-card/conversation-card-skeleton";

interface ConversationPanelProps {
  onClose?: () => void;
}

const noop = () => {};

const ONE_HOUR_MS = 60 * 60 * 1000;

const partitionByCutoff = <T extends { updated_at: string }>(
  items: readonly T[],
): { recent: T[]; older: T[] } => {
  const cutoff = Date.now() - ONE_HOUR_MS;
  const recent: T[] = [];
  const older: T[] = [];
  for (const item of items) {
    const updatedAt = item.updated_at ? Date.parse(item.updated_at) : NaN;
    if (Number.isFinite(updatedAt) && updatedAt < cutoff) {
      older.push(item);
    } else {
      recent.push(item);
    }
  }
  return { recent, older };
};

export function ConversationPanel({ onClose }: ConversationPanelProps) {
  const { t } = useTranslation("openhands");
  const { conversationId: currentConversationId, navigate } = useNavigation();
  // Click-outside is only relevant in the legacy drawer mode where an
  // onClose handler is provided. When the panel is rendered inline (e.g.
  // as the always-visible conversation list pane), clicking outside should
  // not dismiss the list, so we pass a no-op callback in that case.
  const ref = useClickOutsideElement<HTMLDivElement>(onClose ?? noop);

  const [confirmDeleteModalVisible, setConfirmDeleteModalVisible] =
    React.useState(false);
  const [confirmStopModalVisible, setConfirmStopModalVisible] =
    React.useState(false);
  const [
    confirmExitConversationModalVisible,
    setConfirmExitConversationModalVisible,
  ] = React.useState(false);
  const [confirmDeleteOlderVisible, setConfirmDeleteOlderVisible] =
    React.useState(false);
  const [showOlderConversations, setShowOlderConversations] =
    React.useState(false);
  const [selectedConversationId, setSelectedConversationId] = React.useState<
    string | null
  >(null);
  const [selectedConversationTitle, setSelectedConversationTitle] =
    React.useState<string | null>(null);
  const [openContextMenuId, setOpenContextMenuId] = React.useState<
    string | null
  >(null);

  const {
    data,
    isFetching,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = usePaginatedConversations();

  // Fetch in-progress start tasks
  const { data: startTasks } = useStartTasks();

  // Flatten all pages into a single array of conversations (V1 uses 'items' instead of 'results')
  const conversations = data?.pages.flatMap((page) => page.items) ?? [];

  // Partition conversations by last_updated cutoff (1 hour). Recent ones are
  // always visible; older ones are hidden by default behind a show/hide toggle.
  // The partition is recomputed only when the underlying paged data changes;
  // `conversations` is rebuilt by flatMap on every render, so depending on
  // `data` instead keeps the cutoff stable across unrelated re-renders.
  const { recent: recentConversations, older: olderConversations } =
    React.useMemo(
      () => partitionByCutoff(conversations),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [data],
    );

  const { mutate: deleteConversation } = useDeleteConversation();
  const { mutate: pauseConversation } = useUnifiedPauseConversation();
  const { mutate: updateConversation } = useUpdateConversation();

  // Set up infinite scroll
  const scrollContainerRef = useInfiniteScroll({
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    threshold: 200, // Load more when 200px from bottom
  });

  const handleDeleteProject = (conversationId: string, title: string) => {
    setConfirmDeleteModalVisible(true);
    setSelectedConversationId(conversationId);
    setSelectedConversationTitle(title);
  };

  const handleStopConversation = (conversationId: string) => {
    setConfirmStopModalVisible(true);
    setSelectedConversationId(conversationId);
  };

  const handleConversationTitleChange = async (
    conversationId: string,
    newTitle: string,
  ) => {
    updateConversation(
      { conversationId, newTitle },
      {
        onSuccess: () => {
          displaySuccessToast(t(I18nKey.CONVERSATION$TITLE_UPDATED));
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (selectedConversationId) {
      deleteConversation(
        { conversationId: selectedConversationId },
        {
          onSuccess: () => {
            if (selectedConversationId === currentConversationId) {
              navigate("/conversations");
            }
          },
        },
      );
    }
  };

  const handleConfirmStop = () => {
    if (selectedConversationId) {
      pauseConversation({
        conversationId: selectedConversationId,
      });
    }
  };

  const handleConfirmDeleteOlder = () => {
    const idsToDelete = olderConversations.map((c) => c.id);
    const willClearActive =
      currentConversationId !== null &&
      idsToDelete.includes(currentConversationId);
    for (const id of idsToDelete) {
      deleteConversation({ conversationId: id });
    }
    if (willClearActive) {
      navigate("/conversations");
    }
  };

  const renderConversationCard = (
    conversation: (typeof conversations)[number],
  ) => (
    <NavigationLink
      key={conversation.id}
      to={`/conversations/${conversation.id}`}
      onClick={onClose}
    >
      <ConversationCard
        onDelete={() =>
          handleDeleteProject(conversation.id, conversation.title ?? "")
        }
        onStop={() => handleStopConversation(conversation.id)}
        onChangeTitle={(title) =>
          handleConversationTitleChange(conversation.id, title)
        }
        title={conversation.title ?? ""}
        selectedRepository={{
          selected_repository: conversation.selected_repository,
          selected_branch: conversation.selected_branch,
          git_provider: conversation.git_provider as Provider,
        }}
        lastUpdatedAt={conversation.updated_at}
        createdAt={conversation.created_at}
        executionStatus={conversation.execution_status}
        conversationId={conversation.id}
        contextMenuOpen={openContextMenuId === conversation.id}
        onContextMenuToggle={(isOpen) =>
          setOpenContextMenuId(isOpen ? conversation.id : null)
        }
        isActive={conversation.id === currentConversationId}
        workspaceWorkingDir={conversation.workspace?.working_dir}
      />
    </NavigationLink>
  );

  return (
    <div
      ref={(node) => {
        // TODO: Combine both refs somehow
        if (ref.current !== node) ref.current = node;
        if (scrollContainerRef.current !== node)
          scrollContainerRef.current = node;
      }}
      data-testid="conversation-panel"
      className="w-full h-full overflow-y-auto custom-scrollbar-always"
    >
      {isFetching && conversations.length === 0 && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <ConversationCardSkeleton key={index} />
          ))}
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-danger">{error.message}</p>
        </div>
      )}
      {!isFetching && conversations?.length === 0 && !startTasks?.length && (
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-neutral-400">
            {t(I18nKey.CONVERSATION$NO_CONVERSATIONS)}
          </p>
        </div>
      )}
      {/* Render in-progress start tasks first */}
      {startTasks?.map((task) => (
        <NavigationLink
          key={task.id}
          to={`/conversations/task-${task.id}`}
          onClick={onClose}
        >
          <StartTaskCard task={task} />
        </NavigationLink>
      ))}
      {/* Recent conversations (last_updated within the past hour) */}
      {recentConversations.map(renderConversationCard)}

      {/* Older conversations are hidden by default behind a count + toggle */}
      {olderConversations.length > 0 && (
        <div
          data-testid="older-conversations-summary"
          className="px-3 py-2 text-xs text-neutral-400 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[#1f2228]"
        >
          <span>
            {olderConversations.length}{" "}
            {t(I18nKey.CONVERSATION$N_OLDER_CONVERSATIONS)}:
          </span>
          <button
            type="button"
            data-testid="toggle-older-conversations"
            onClick={() => setShowOlderConversations((value) => !value)}
            className="underline hover:text-white"
          >
            {showOlderConversations
              ? t(I18nKey.CONVERSATION$HIDE)
              : t(I18nKey.CONVERSATION$SHOW_ALL)}
          </button>
          <button
            type="button"
            data-testid="delete-older-conversations"
            onClick={() => setConfirmDeleteOlderVisible(true)}
            className="underline hover:text-danger"
          >
            {t(I18nKey.CONVERSATION$DELETE_ALL)}
          </button>
        </div>
      )}

      {showOlderConversations && olderConversations.map(renderConversationCard)}

      {/* Loading indicator for fetching more conversations */}
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <LoadingSpinner size="small" />
        </div>
      )}

      {confirmDeleteModalVisible && (
        <ConfirmDeleteModal
          onConfirm={() => {
            handleConfirmDelete();
            setConfirmDeleteModalVisible(false);
            setSelectedConversationTitle(null);
          }}
          onCancel={() => {
            setConfirmDeleteModalVisible(false);
            setSelectedConversationTitle(null);
          }}
          conversationTitle={selectedConversationTitle ?? undefined}
        />
      )}

      {confirmDeleteOlderVisible && (
        <ConfirmDeleteModal
          title={t(I18nKey.CONVERSATION$CONFIRM_DELETE_OLDER_TITLE)}
          description={t(I18nKey.CONVERSATION$CONFIRM_DELETE_OLDER_DESC, {
            count: olderConversations.length,
          })}
          onConfirm={() => {
            handleConfirmDeleteOlder();
            setConfirmDeleteOlderVisible(false);
          }}
          onCancel={() => setConfirmDeleteOlderVisible(false)}
        />
      )}

      {confirmStopModalVisible && (
        <ConfirmStopModal
          onConfirm={() => {
            handleConfirmStop();
            setConfirmStopModalVisible(false);
          }}
          onCancel={() => setConfirmStopModalVisible(false)}
        />
      )}

      {confirmExitConversationModalVisible && (
        <ExitConversationModal
          onConfirm={() => {
            onClose?.();
          }}
          onClose={() => setConfirmExitConversationModalVisible(false)}
          onCancel={() => setConfirmExitConversationModalVisible(false)}
        />
      )}
    </div>
  );
}
