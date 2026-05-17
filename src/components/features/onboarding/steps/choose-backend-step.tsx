import React from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Monitor,
  Container,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { BrandButton } from "#/components/features/settings/brand-button";
import { getAgentServerSessionApiKey } from "#/api/agent-server-config";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  getSetupStatus,
  startDockerBackend,
  stopDockerBackend,
  type SetupStatus,
} from "#/api/setup-service";
import { useActiveBackendContext } from "#/contexts/active-backend-context";

interface ChooseBackendStepProps {
  onBack: () => void;
  onNext: () => void;
}

type DockerState = "idle" | "checking" | "starting" | "running" | "error";

const DOCKER_BACKEND_WORKING_DIR = "/projects";

function dockerBackendHost(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function normalizeBackendHost(host: string): string {
  try {
    return new URL(host).origin;
  } catch {
    return host.trim().replace(/\/+$/, "");
  }
}

/**
 * Step 1: Choose Backend — multi-select Local + Docker.
 *
 * Local is always selected and already running. Docker is opt-in:
 * when selected, the setup server is called to start a Docker container.
 */
export function ChooseBackendStep({ onBack, onNext }: ChooseBackendStepProps) {
  const { t } = useTranslation("openhands");
  const { backends, addBackend, updateBackend, removeBackend } =
    useActiveBackendContext();
  const [localSelected, setLocalSelected] = React.useState(true);
  const [dockerSelected, setDockerSelected] = React.useState(false);
  const [projectPath, setProjectPath] = React.useState("");
  const [dockerState, setDockerState] = React.useState<DockerState>("idle");
  const [dockerError, setDockerError] = React.useState<string | null>(null);
  const [setupStatus, setSetupStatus] = React.useState<SetupStatus | null>(
    null,
  );
  const [setupAvailable, setSetupAvailable] = React.useState(true);
  const dockerBackendName = t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_TITLE);

  const findRegisteredDockerBackend = React.useCallback(
    (host?: string) => {
      const normalizedHost = host ? normalizeBackendHost(host) : null;
      return backends.find(
        (backend) =>
          backend.kind === "local" &&
          ((normalizedHost &&
            normalizeBackendHost(backend.host) === normalizedHost) ||
            backend.name === dockerBackendName),
      );
    },
    [backends, dockerBackendName],
  );

  const registerDockerBackend = React.useCallback(
    (host: string) => {
      const normalizedHost = normalizeBackendHost(host);
      const payload = {
        name: dockerBackendName,
        host: normalizedHost,
        apiKey: getAgentServerSessionApiKey() ?? "",
        kind: "local" as const,
        workingDir: DOCKER_BACKEND_WORKING_DIR,
      };
      const existing = findRegisteredDockerBackend(normalizedHost);

      if (existing) {
        if (
          existing.name !== payload.name ||
          normalizeBackendHost(existing.host) !== payload.host ||
          existing.apiKey !== payload.apiKey ||
          existing.kind !== payload.kind ||
          existing.workingDir !== payload.workingDir
        ) {
          updateBackend(existing.id, payload);
        }
        return existing;
      }

      return addBackend(payload);
    },
    [addBackend, dockerBackendName, findRegisteredDockerBackend, updateBackend],
  );

  // Check Docker availability on mount
  React.useEffect(() => {
    getSetupStatus()
      .then((status) => {
        setSetupStatus(status);
        setSetupAvailable(true);
      })
      .catch(() => {
        setSetupAvailable(false);
      });
  }, []);

  const handleDockerToggle = React.useCallback(() => {
    if (dockerSelected && dockerState === "running") {
      const registeredDocker = findRegisteredDockerBackend();
      if (registeredDocker) {
        removeBackend(registeredDocker.id);
      }
      stopDockerBackend().catch((err) => {
        console.error("Failed to stop Docker backend", err);
      });
    }

    setDockerSelected((prev) => !prev);
    setDockerError(null);
    setDockerState("idle");
  }, [dockerSelected, dockerState, findRegisteredDockerBackend, removeBackend]);

  const handleStartDocker = React.useCallback(async () => {
    if (!projectPath.trim()) {
      setDockerError("Please enter a workspace directory path.");
      return;
    }

    setDockerState("checking");
    setDockerError(null);

    try {
      const status = await getSetupStatus();
      setSetupStatus(status);

      if (!status.dockerInstalled) {
        setDockerState("error");
        setDockerError(
          t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_NOT_INSTALLED),
        );
        return;
      }

      if (!status.dockerRunning) {
        setDockerState("error");
        setDockerError(t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_NOT_RUNNING));
        return;
      }

      if (status.dockerBackendRunning) {
        registerDockerBackend(
          status.dockerBackendUrl ??
            dockerBackendHost(status.dockerBackendPort),
        );
        setDockerState("running");
        return;
      }

      setDockerState("starting");
      const result = await startDockerBackend(projectPath.trim());
      registerDockerBackend(result.url || `${result.host}:${result.port}`);
      setDockerState("running");
    } catch (err) {
      setDockerState("error");
      setDockerError(
        t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_FAILED, {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }, [projectPath, registerDockerBackend, t]);

  const canProceed =
    (localSelected && (!dockerSelected || dockerState === "running")) ||
    (!localSelected && dockerSelected && dockerState === "running");
  const dockerStartDisabled = !setupAvailable;
  const dockerAvailabilityWarning = !setupAvailable
    ? t(I18nKey.ONBOARDING$CHOOSE_BACKEND_SETUP_UNAVAILABLE)
    : setupStatus && !setupStatus.dockerInstalled
      ? t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_NOT_INSTALLED)
      : setupStatus && !setupStatus.dockerRunning
        ? t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_NOT_RUNNING)
        : null;

  return (
    <div
      data-testid="onboarding-step-choose-backend"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-white">
          {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_TITLE)}
        </h2>
        <p className="text-sm text-gray-400">
          {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_SUBTITLE)}
        </p>
      </header>

      {/* Local Backend Card */}
      <button
        type="button"
        data-testid="choose-backend-local"
        data-selected={localSelected}
        aria-pressed={localSelected}
        onClick={() => setLocalSelected((prev) => !prev)}
        className={cn(
          "relative flex flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-colors",
          localSelected
            ? "border-green-500/60 bg-green-500/10"
            : "border-white/10 bg-base-secondary hover:border-white/20",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="size-4 text-green-400" aria-hidden />
            <span className="text-sm font-semibold text-green-300">
              {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_LOCAL_TAG)}
            </span>
            <span className="text-base font-medium text-white">
              {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_LOCAL_TITLE)}
            </span>
          </div>
          {localSelected && (
            <Check className="size-4 shrink-0 text-green-400" aria-hidden />
          )}
        </div>
        <p className="text-xs text-gray-400">
          {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_LOCAL_DESC)}
        </p>
        <div className="flex flex-col gap-0.5 text-xs text-gray-400">
          <span>
            <span className="text-green-400">{"\u2713"}</span>{" "}
            {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_LOCAL_PROS)}
          </span>
          <span>
            <span className="text-red-400">{"\u2717"}</span>{" "}
            {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_LOCAL_CONS)}
          </span>
        </div>
        <p className="text-xs text-gray-300">
          {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_LOCAL_CONFIRM_NOTE)}
        </p>
      </button>

      {/* Docker Backend Card */}
      <div
        data-testid="choose-backend-docker"
        data-selected={dockerSelected}
        className={cn(
          "relative flex flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-colors",
          dockerSelected
            ? "border-primary/60 bg-primary/10"
            : "border-white/10 bg-base-secondary",
        )}
      >
        <button
          type="button"
          data-testid="choose-backend-docker-toggle"
          onClick={handleDockerToggle}
          aria-pressed={dockerSelected}
          className="flex flex-col gap-2 text-left"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Container className="size-4 text-primary" aria-hidden />
              <span className="text-sm font-semibold text-primary">
                {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_TAG)}
              </span>
              <span className="text-base font-medium text-white">
                {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_TITLE)}
              </span>
            </div>
            {dockerSelected && (
              <Check className="size-4 shrink-0 text-primary" aria-hidden />
            )}
          </div>

          <p className="text-xs text-gray-400">
            {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_DESC)}
          </p>
          <div className="flex flex-col gap-0.5 text-xs text-gray-400">
            <span>
              <span className="text-green-400">{"\u2713"}</span>{" "}
              {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_PROS)}
            </span>
            <span>
              <span className="text-red-400">{"\u2717"}</span>{" "}
              {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_CONS)}
            </span>
          </div>
        </button>

        {dockerAvailabilityWarning && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{dockerAvailabilityWarning}</span>
          </div>
        )}

        {dockerSelected && (
          <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-3">
            <label
              htmlFor="docker-project-path"
              className="text-xs text-gray-400"
            >
              {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_PATH_LABEL)}
            </label>
            <input
              id="docker-project-path"
              data-testid="choose-backend-docker-path"
              type="text"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="/path/to/your/projects"
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-primary/60 focus:outline-none"
            />
            <p className="text-xs text-gray-500">
              {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_PATH_HINT)}
            </p>

            {(dockerState === "idle" || dockerState === "error") && (
              <BrandButton
                testId="choose-backend-docker-start"
                type="button"
                variant="secondary"
                isDisabled={dockerStartDisabled}
                onClick={handleStartDocker}
              >
                {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_START_BTN)}
              </BrandButton>
            )}

            {dockerState === "checking" && (
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <Loader2 className="size-4 animate-spin" />
                <span>
                  {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_CHECKING)}
                </span>
              </div>
            )}

            {dockerState === "starting" && (
              <div className="flex items-center gap-2 text-xs text-primary">
                <Loader2 className="size-4 animate-spin" />
                <span>
                  {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_STARTING)}
                </span>
              </div>
            )}

            {dockerState === "running" && (
              <div
                data-testid="choose-backend-docker-status-running"
                className="flex items-center gap-2 text-xs text-green-400"
              >
                <CheckCircle2 className="size-4" />
                <span>
                  {t(I18nKey.ONBOARDING$CHOOSE_BACKEND_DOCKER_STARTED)}
                </span>
              </div>
            )}

            {dockerError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{dockerError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 bg-base-secondary pt-4 pb-7">
        <BrandButton
          testId="onboarding-backend-back"
          type="button"
          variant="secondary"
          onClick={onBack}
        >
          {t(I18nKey.ONBOARDING$BACK)}
        </BrandButton>
        <BrandButton
          testId="onboarding-backend-next"
          type="button"
          variant="primary"
          isDisabled={!canProceed}
          onClick={onNext}
        >
          {t(I18nKey.ONBOARDING$NEXT)}
        </BrandButton>
      </div>
    </div>
  );
}
