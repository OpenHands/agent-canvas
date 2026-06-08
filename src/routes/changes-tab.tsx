import { useTranslation } from "react-i18next";
import React from "react";
import { FileDiffViewer } from "#/components/features/diff-viewer/file-diff-viewer";
import { EmptyChangesMessage } from "#/components/features/diff-viewer/empty-changes-message";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import { useUnifiedGetGitChanges } from "#/hooks/query/use-unified-get-git-changes";
import { I18nKey } from "#/i18n/declaration";
import { RUNTIME_INACTIVE_STATES } from "#/types/agent-state";
import { RandomTip } from "#/components/features/tips/random-tip";
import { useAgentState } from "#/hooks/use-agent-state";

// Error message patterns
const GIT_REPO_ERROR_PATTERN = /not a git repository/i;

function StatusMessage({ children }: React.PropsWithChildren) {
  return (
    <div className="w-full h-full flex flex-col items-center text-center justify-center text-2xl text-foreground">
      {children}
    </div>
  );
}

function GitChanges() {
  const { t } = useTranslation("openhands");
  const {
    data: gitChanges,
    isSuccess,
    isError,
    error,
    isLoading: loadingGitChanges,
  } = useUnifiedGetGitChanges();

  const [statusMessage, setStatusMessage] = React.useState<string[] | null>(
    null,
  );

  const { curAgentState } = useAgentState();
  const runtimeIsActive = !RUNTIME_INACTIVE_STATES.includes(curAgentState);

  const isNotGitRepoError =
    error && GIT_REPO_ERROR_PATTERN.test(retrieveAxiosErrorMessage(error));

  React.useEffect(() => {
    if (!runtimeIsActive) {
      setStatusMessage([I18nKey.DIFF_VIEWER$WAITING_FOR_RUNTIME]);
    } else if (error) {
      const errorMessage = retrieveAxiosErrorMessage(error);
      if (GIT_REPO_ERROR_PATTERN.test(errorMessage)) {
        setStatusMessage([
          I18nKey.DIFF_VIEWER$NOT_A_GIT_REPO,
          I18nKey.DIFF_VIEWER$ASK_OH,
        ]);
      } else {
        setStatusMessage([errorMessage]);
      }
    } else if (loadingGitChanges) {
      setStatusMessage([I18nKey.DIFF_VIEWER$LOADING]);
    } else {
      setStatusMessage(null);
    }
  }, [
    runtimeIsActive,
    isNotGitRepoError,
    loadingGitChanges,
    error,
    setStatusMessage,
  ]);

  return (
    <main className="h-full w-full flex flex-col items-stretch">
      {!isSuccess || !gitChanges.length ? (
        <div className="flex flex-col h-full w-full">
          <div className="flex-1 flex items-center justify-center">
            {statusMessage && (
              <StatusMessage>
                {statusMessage.map((msg) => (
                  <span key={msg}>{t(msg)}</span>
                ))}
              </StatusMessage>
            )}
            {!statusMessage && isSuccess && gitChanges.length === 0 && (
              <EmptyChangesMessage />
            )}
          </div>
          {!isError && isSuccess && gitChanges.length === 0 && (
            <div className="w-full text-m bg-tertiary p-4 text-left">
              <RandomTip />
            </div>
          )}
        </div>
      ) : (
        <div className="h-full overflow-y-auto flex flex-col items-stretch custom-scrollbar-always">
          {gitChanges.slice(0, 100).map((change) => (
            <FileDiffViewer
              key={change.path}
              path={change.path}
              type={change.status}
            />
          ))}
        </div>
      )}
    </main>
  );
}

export default GitChanges;
