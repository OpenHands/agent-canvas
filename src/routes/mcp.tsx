import React from "react";
import { AxiosError } from "axios";
import { ExtensionsNavigation } from "#/components/features/skills/extensions-navigation";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { useSettings } from "#/hooks/query/use-settings";
import { useDeleteMcpServer } from "#/hooks/mutation/use-delete-mcp-server";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { parseMcpConfig } from "#/utils/mcp-config";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import {
  findCatalogEntryForServer,
  findInstalledMatch,
  installedServerMatchesQuery,
  marketplaceEntryMatchesQuery,
} from "#/utils/mcp-marketplace-utils";
import { MCP_MARKETPLACE, MarketplaceEntry } from "#/constants/mcp-marketplace";
import { MCPConfig } from "#/types/settings";
import { ExistingInstall, MCPServerConfig } from "#/types/mcp-server";
import {
  InstalledServersSection,
  MarketplaceSearch,
  MarketplaceSection,
  InstallServerModal,
  CustomServerEditor,
} from "#/components/features/mcp-page";

function flattenMcpConfig(config: MCPConfig): MCPServerConfig[] {
  return [
    ...config.sse_servers.map((server, index) => ({
      id: `sse-${index}`,
      type: "sse" as const,
      url: typeof server === "string" ? server : server.url,
      api_key: typeof server === "object" ? server.api_key : undefined,
    })),
    ...config.stdio_servers.map((server, index) => ({
      id: `stdio-${index}`,
      type: "stdio" as const,
      name: server.name,
      command: server.command,
      args: server.args,
      env: server.env,
    })),
    ...config.shttp_servers.map((server, index) => ({
      id: `shttp-${index}`,
      type: "shttp" as const,
      url: typeof server === "string" ? server : server.url,
      api_key: typeof server === "object" ? server.api_key : undefined,
      timeout: typeof server === "object" ? server.timeout : undefined,
    })),
  ];
}

// Looked up lazily inside the component so we don't crash at module
// load if the catalog ever drops Tavily.
function getTavilyEntry(): MarketplaceEntry | undefined {
  return MCP_MARKETPLACE.find((e) => e.id === "tavily");
}

export default function MCPPage() {
  const { t } = useTranslation("openhands");
  const { data: settings, isLoading } = useSettings();
  const { mutate: deleteMcpServer, isPending: isDeleting } =
    useDeleteMcpServer();
  const { mutate: saveSettings, isPending: isSavingSettings } =
    useSaveSettings();
  const activeBackend = useActiveBackend();
  const backendKind = activeBackend.backend.kind;

  const [installEntry, setInstallEntry] =
    React.useState<MarketplaceEntry | null>(null);
  const [editingServer, setEditingServer] =
    React.useState<MCPServerConfig | null>(null);
  const [serverToDelete, setServerToDelete] =
    React.useState<ExistingInstall | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");

  const tavilyEntry = getTavilyEntry();
  const mcpConfig = parseMcpConfig(settings?.agent_settings?.mcp_config);
  const allServers = flattenMcpConfig(mcpConfig);
  const tavilyBuiltinInstalled = !!settings?.search_api_key_set;

  const isInstalled = (entry: MarketplaceEntry) =>
    !!findInstalledMatch(entry.template, allServers, settings);

  // Filter installed servers by the search query. We pair each server
  // with its catalog entry (if any) so the search can match friendly
  // names like "Slack" against a stdio server whose own `.name` is
  // just "slack".
  const filteredInstalledServers = allServers.filter((server) =>
    installedServerMatchesQuery(
      server,
      findCatalogEntryForServer(server, MCP_MARKETPLACE),
      searchQuery,
    ),
  );
  const tavilyVisibleAfterSearch =
    tavilyBuiltinInstalled &&
    !!tavilyEntry &&
    marketplaceEntryMatchesQuery(tavilyEntry, searchQuery);

  const handleMarketplaceClick = (entry: MarketplaceEntry) => {
    setInstallEntry(entry);
  };

  const handleEdit = (server: MCPServerConfig) => {
    setEditingServer(server);
  };

  const handleDeleteClick = (serverId: string) => {
    const target = allServers.find((s) => s.id === serverId);
    if (target) setServerToDelete({ kind: "mcp", server: target });
  };

  const handleConfirmDelete = () => {
    if (!serverToDelete) return;
    if (serverToDelete.kind === "tavily-builtin") {
      saveSettings(
        { search_api_key: "" },
        {
          onSuccess: () => {
            displaySuccessToast(t(I18nKey.MCP$REMOVE_SUCCESS));
            setServerToDelete(null);
          },
          onError: (err) => {
            const message = retrieveAxiosErrorMessage(err as AxiosError);
            displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
          },
        },
      );
      return;
    }
    // Pass the full server config — useDeleteMcpServer re-resolves its
    // position against the fresh settings at mutation time, so a
    // background refresh between this click and confirm cannot point
    // us at the wrong index.
    deleteMcpServer(serverToDelete.server, {
      onSuccess: () => {
        displaySuccessToast(t(I18nKey.MCP$REMOVE_SUCCESS));
        setServerToDelete(null);
      },
      onError: (err) => {
        const message = retrieveAxiosErrorMessage(err as AxiosError);
        displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
      },
    });
  };

  if (isLoading || !settings) {
    return (
    <div
      data-testid="mcp-page"
      className="flex h-full gap-10"
    >
        <ExtensionsNavigation />
        <div className="flex h-full flex-1 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-tertiary border-t-primary animate-spin" />
        </div>
      </div>
    );
  }

  // Existing match for the install modal — drives Add vs Edit and the
  // optional "Remove" affordance for already-installed catalog entries.
  const installExisting = installEntry
    ? findInstalledMatch(installEntry.template, allServers, settings)
    : null;

  return (
    <div
      data-testid="mcp-page"
      className="flex h-full gap-10"
    >
      <ExtensionsNavigation />
      <main className="flex-1 min-w-0 overflow-auto custom-scrollbar-always pr-[14px] pt-8 pb-12">
        <div className="max-w-5xl flex flex-col gap-8">
        <div className="min-w-0 space-y-1 mb-4">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-xl font-semibold leading-6 text-foreground">{t(I18nKey.SETTINGS$MCP_TITLE)}</h2>
            <BrandButton
              type="button"
              variant="secondary"
              testId="mcp-add-custom-server"
              onClick={() => setEditingServer({ id: "", type: "sse" })}
            >
              {t(I18nKey.MCP$ADD_CUSTOM)}
            </BrandButton>
          </div>
          <div className="max-w-2xl text-sm text-tertiary-light">
            {t(I18nKey.MCP$PAGE_DESCRIPTION)}
          </div>
        </div>

        <MarketplaceSearch value={searchQuery} onChange={setSearchQuery} />

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">
            {t(I18nKey.MCP$INSTALLED_TITLE)}
          </h2>
          <InstalledServersSection
            servers={filteredInstalledServers}
            tavilyBuiltinInstalled={tavilyVisibleAfterSearch}
            hasAnyInstalled={allServers.length > 0 || tavilyBuiltinInstalled}
            query={searchQuery}
            onEdit={handleEdit}
            onDelete={handleDeleteClick}
            onConfigureTavilyBuiltin={
              tavilyEntry ? () => setInstallEntry(tavilyEntry) : undefined
            }
            onRemoveTavilyBuiltin={() =>
              setServerToDelete({ kind: "tavily-builtin" })
            }
          />
        </section>

        <MarketplaceSection
          isInstalled={isInstalled}
          backendKind={backendKind}
          onSelect={handleMarketplaceClick}
          query={searchQuery}
        />
        </div>

        {installEntry && (
          <InstallServerModal
            entry={installEntry}
            existing={installExisting}
            onClose={() => setInstallEntry(null)}
          />
        )}

        {/* Custom (or non-marketplace) server editor — falls back to the
            legacy MCPServerForm for full control. The empty-id sentinel
            (`{ id: "", type: "sse" }`) means "add new". */}
        {editingServer && (
          <CustomServerEditor
            server={editingServer}
            existingServers={allServers}
            onClose={() => setEditingServer(null)}
          />
        )}

        {serverToDelete && (
          <ConfirmationModal
            text={t(I18nKey.SETTINGS$MCP_CONFIRM_DELETE)}
            onCancel={() => setServerToDelete(null)}
            onConfirm={handleConfirmDelete}
            isConfirming={isDeleting || isSavingSettings}
          />
        )}
      </main>
    </div>
  );
}
