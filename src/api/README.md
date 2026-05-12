# API Services Guide

## Overview

Services are the abstraction layer between frontend components and backend APIs. They encapsulate HTTP requests using `createHttpClient()` from `@openhands/typescript-client` (wrapped in `src/api/typescript-client.ts`, which resolves the active backend's host + `X-Session-API-Key`) and provide typed methods for each endpoint.

Each service is a plain object with async methods.

## Structure

Each service lives in its own directory:

```
src/api/
├── feature-service/
│   ├── feature-service.api.ts    # Service methods
│   └── feature.types.ts          # Types and interfaces
└── typescript-client.ts          # `createHttpClient` + typed SDK clients
```

## Creating a Service

Use an object literal with named export. Use object destructuring for parameters to make calls self-documenting.

```typescript
// feature-service/feature-service.api.ts
import { createHttpClient } from "../typescript-client";
import { Feature, CreateFeatureParams } from "./feature.types";

export const featureService = {
  getFeature: async ({ id }: { id: string }) => {
    const response = await createHttpClient().get<Feature>(
      `/api/features/${id}`,
    );
    return response.data;
  },

  createFeature: async ({ name, description }: CreateFeatureParams) => {
    const response = await createHttpClient().post<Feature>("/api/features", {
      name,
      description,
    });
    return response.data;
  },
};
```

### Types

Define types in a separate file within the same directory:

```typescript
// feature-service/feature.types.ts
export interface Feature {
  id: string;
  name: string;
  description: string;
}

export interface CreateFeatureParams {
  name: string;
  description: string;
}
```

## Usage

> [!IMPORTANT]
> **Don't call services directly in components.** Wrap them in TanStack Query hooks.
>
> Why? TanStack Query provides:
> - **Caching** - Avoid redundant network requests
> - **Deduplication** - Multiple components requesting the same data share one request
> - **Loading/error states** - Built-in `isLoading`, `isError`, `data` states
> - **Background refetching** - Data stays fresh automatically
>
> Hooks location:
> - `src/hooks/query/` for data fetching (`useQuery`)
> - `src/hooks/mutation/` for writes/updates (`useMutation`)

```typescript
// src/hooks/query/use-feature.ts
import { useQuery } from "@tanstack/react-query";
import { featureService } from "#/api/feature-service/feature-service.api";

export const useFeature = (id: string) => {
  return useQuery({
    queryKey: ["feature", id],
    queryFn: () => featureService.getFeature({ id }),
  });
};
```

## Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| Directory | `feature-service/` | `secrets-service/` |
| Service file | `feature-service.api.ts` | `secrets-service.api.ts` |
| Types file | `feature.types.ts` | `secrets.types.ts` |
| Export name | `featureService` | `secretsService` |
