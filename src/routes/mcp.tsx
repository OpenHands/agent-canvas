import React from "react";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { Typography } from "#/ui/typography";
import { BrandButton } from "#/components/features/settings/brand-button";
import { BackendSyncedSettingsBadge } from "#/components/features/settings/backend-synced-settings-badge";
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

const TAVILY_ENTRY = MCP_MARKETPLACE.find((e) => e.id === "tavily")!;

export default function MCPPage() {
  const { t } = useTranslation("openhands");
  const { data: settings, isLoading } = useSettings();
  const { mutate: deleteMcpServer } = useDeleteMcpServer();
  const { mutate: saveSettings } = useSaveSettings();
  const activeBackend = useActiveBackend();
  const backendKind = activeBackend.backend.kind;

  const [installEntry, setInstallEntry] =
    React.useState<MarketplaceEntry | null>(null);
  const [editingServer, setEditingServer] =
    React.useState<MCPServerConfig | null>(null);
  const [serverToDelete, setServerToDelete] = React.useState<
    MCPServerConfig | "tavily-builtin" | null
  >(null);
  const [searchQuery, setSearchQuery] = React.useState("");

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
  const tavilyCatalogEntry = MCP_MARKETPLACE.find((e) => e.id === "tavily");
  const tavilyVisibleAfterSearch =
    tavilyBuiltinInstalled &&
    !!tavilyCatalogEntry &&
    marketplaceEntryMatchesQuery(tavilyCatalogEntry, searchQuery);

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
    if (serverToDelete === "tavily-builtin") {
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
    deleteMcpServer(serverToDelete.id, {
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
      <main
        data-testid="mcp-page"
        className="h-full flex items-center justify-center"
      >
        <div className="h-8 w-8 rounded-full border-2 border-tertiary border-t-primary animate-spin" />
      </main>
    );
  }

  // Existing match for the install modal — drives Add vs Edit and the
  // optional "Remove" affordance for already-installed catalog entries.
  const installExisting = installEntry
    ? findInstalledMatch(installEntry.template, allServers, settings)
    : null;

  return (
    <main
      data-testid="mcp-page"
      className="h-full overflow-auto custom-scrollbar-always px-6 md:px-10 pt-8 pb-12"
    >
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Typography.H2>{t(I18nKey.SETTINGS$MCP_TITLE)}</Typography.H2>
              <BackendSyncedSettingsBadge />
            </div>
            <BrandButton
              type="button"
              variant="secondary"
              testId="mcp-add-custom-server"
              onClick={() => setEditingServer({ id: "", type: "sse" })}
            >
              {t(I18nKey.MCP$ADD_CUSTOM)}
            </BrandButton>
          </div>
          <Typography.Paragraph className="text-sm text-tertiary-alt">
            {t(I18nKey.MCP$PAGE_DESCRIPTION)}
          </Typography.Paragraph>
        </header>

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
            onConfigureTavilyBuiltin={() => setInstallEntry(TAVILY_ENTRY)}
            onRemoveTavilyBuiltin={() => setServerToDelete("tavily-builtin")}
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
        />
      )}
    </main>
  );
}
