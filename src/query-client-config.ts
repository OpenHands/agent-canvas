import { QueryCache, MutationCache, QueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import i18n from "#/i18n";
import { I18nKey } from "./i18n/declaration";
import { retrieveAxiosErrorMessage } from "./utils/retrieve-axios-error-message";
import { displayErrorToast } from "./utils/custom-toast-handlers";

const handle401Error = (error: AxiosError, client: QueryClient) => {
  if (error?.response?.status === 401 || error?.status === 401) {
    client.invalidateQueries({ queryKey: ["user", "authenticated"] });
  }
};

const shownErrors = new Set<string>();

export const createAgentServerQueryClient = () => {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        const isAuthQuery =
          query.queryKey[0] === "user" && query.queryKey[1] === "authenticated";
        if (!isAuthQuery) {
          handle401Error(error, client);
        }

        const disableToast =
          query.meta?.disableToast ?? query.options.meta?.disableToast;

        if (!disableToast) {
          const errorMessage = retrieveAxiosErrorMessage(error);

          if (!shownErrors.has(errorMessage || "")) {
            displayErrorToast(errorMessage || i18n.t(I18nKey.ERROR$GENERIC));
            shownErrors.add(errorMessage || "");

            setTimeout(() => {
              shownErrors.delete(errorMessage || "");
            }, 3000);
          }
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _, __, mutation) => {
        handle401Error(error, client);

        const disableToast =
          mutation?.meta?.disableToast ?? mutation?.options.meta?.disableToast;

        if (!disableToast) {
          const message = retrieveAxiosErrorMessage(error);
          displayErrorToast(message || i18n.t(I18nKey.ERROR$GENERIC));
        }
      },
    }),
  });

  return client;
};

let defaultQueryClient: QueryClient | null = null;
let activeQueryClient: QueryClient | null = null;

export const getDefaultQueryClient = () => {
  if (!defaultQueryClient) {
    defaultQueryClient = createAgentServerQueryClient();
    if (import.meta.env.DEV || import.meta.env.VITE_MOCK_API === "true") {
      (
        window as unknown as { __OH_QUERY_CLIENT__?: typeof defaultQueryClient }
      ).__OH_QUERY_CLIENT__ = defaultQueryClient;
    }
  }

  return defaultQueryClient;
};

export const getQueryClient = () =>
  activeQueryClient ?? getDefaultQueryClient();

export const setQueryClient = (client?: QueryClient | null) => {
  activeQueryClient = client ?? getDefaultQueryClient();
  return activeQueryClient;
};

export const queryClient = new Proxy({} as QueryClient, {
  get: (_target, prop) => {
    const client = getQueryClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  set: (_target, prop, value) => {
    const client = getQueryClient();
    return Reflect.set(client, prop, value, client);
  },
}) as QueryClient;
