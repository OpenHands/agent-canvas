import React from "react";
import { AxiosError } from "axios";
import { ExtensionsNavigation } from "#/components/features/skills/extensions-navigation";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { BrandButton } from "#/components/features/settings/brand-button";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { useSettings } from "#/hooks/query/use-settings";
import { useDeleteMcpServer } from "#/hooks/mutation/use-delete-mcp-server";
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
} from "#/utils/mcp-marketplace-utils";
import { MCP_MARKETPLACE, MarketplaceEntry } from "#/constants/mcp-marketplace";
import { MCPConfig } from "#/types/settings";
import { MCPServerConfig } from "#/types/mcp-server";
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

export default function MCPPage() {
  const { t } = useTranslation("openhands");
  const { data: settings, isLoading } = useSettings();
  const { mutate: deleteMcpServer, isPending: isDeleting } =
    useDeleteMcpServer();
  const activeBackend = useActiveBackend();
  const backendKind = activeBackend.backend.kind;

  const [installEntry, setInstallEntry] =
    React.useState<MarketplaceEntry | null>(null);
  const [editingServer, setEditingServer] =
    React.useState<MCPServerConfig | null>(null);
  const [serverToDelete, setServerToDelete] =
    React.useState<MCPServerConfig | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");

  const mcpConfig = parseMcpConfig(settings?.agent_settings?.mcp_config);
  const allServers = flattenMcpConfig(mcpConfig);

  const isInstalled = (entry: MarketplaceEntry) =>
    !!findInstalledMatch(entry.template, allServers);

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

  const handleMarketplaceClick = (entry: MarketplaceEntry) => {
    setInstallEntry(entry);
  };

  const handleEdit = (server: MCPServerConfig) => {
    setEditingServer(server);
  };

  const handleDeleteClick = (serverId: string) => {
    const target = allServers.find((s) => s.id === serverId);
    if (target) setServerToDelete(target);
  };

  const handleConfirmDelete = () => {
    if (!serverToDelete) return;
    // Pass the full server config — useDeleteMcpServer re-resolves its
    // position against the fresh settings at mutation time, so a
    // background refresh between this click and confirm cannot point
    // us at the wrong index.
    deleteMcpServer(serverToDelete, {
      onSuccess: () => {
        displaySuccessToast(t(I18nKey.MCP$REMOVE_SUCCESS));
        setServerToDelete(null);
      },
      onError: (err) => {
        const message = retrieveAxiosErrorMessage(err as AxiosError);
        displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
        setServerToDelete(null);
      },
    });
  };

  if (isLoading || !settings) {
    return (
      <div data-testid="mcp-page" className="flex h-full gap-10">
        <ExtensionsNavigation />
        <div className="flex h-full flex-1 items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-[var(--oh-border)] border-t-white animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="mcp-page" className="flex h-full gap-10">
      <ExtensionsNavigation />
      <main className="flex-1 min-w-0 overflow-auto custom-scrollbar-always pr-[14px] pt-8 pb-12">
        <div className="max-w-5xl flex flex-col gap-6">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold leading-6 text-foreground">
                  {t(I18nKey.SETTINGS$MCP_TITLE)}
                </h2>
                <div className="max-w-2xl text-sm text-tertiary-light">
                  {t(I18nKey.MCP$PAGE_DESCRIPTION)}
                </div>
              </div>
              <BrandButton
                type="button"
                variant="secondary"
                testId="mcp-add-custom-server"
                className="flex-shrink-0 whitespace-nowrap"
                onClick={() => setEditingServer({ id: "", type: "sse" })}
              >
                {t(I18nKey.MCP$ADD_CUSTOM)}
              </BrandButton>
            </div>
          </div>

          <MarketplaceSearch value={searchQuery} onChange={setSearchQuery} />

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-foreground">
              {t(I18nKey.MCP$INSTALLED_TITLE)}
            </h2>
            <InstalledServersSection
              servers={filteredInstalledServers}
              hasAnyInstalled={allServers.length > 0}
              query={searchQuery}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
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
            isConfirming={isDeleting}
          />
        )}
      </main>
    </div>
  );
}
