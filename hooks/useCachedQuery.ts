import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DefaultContext,
  type OperationVariables,
  type QueryHookOptions,
  type QueryResult,
  useQuery,
} from "@apollo/client/react";
import type { DocumentNode } from "graphql";

type Options<TData, TVariables extends OperationVariables> = QueryHookOptions<
  TData,
  TVariables,
  DefaultContext
> & {
  cacheTtlMs?: number;
  cacheKey?: string;
};

const DEFAULT_TTL = 60_000; // 1 minute
const queryTimestamps = new Map<string, number>();

function getQuerySignature(query: DocumentNode): string {
  const locSource = (query as any)?.loc?.source?.body;
  if (typeof locSource === "string") {
    return locSource;
  }
  try {
    return JSON.stringify((query as any)?.definitions ?? query);
  } catch {
    return Math.random().toString(36);
  }
}

function getCacheKey<TVariables>(
  query: DocumentNode,
  variables: TVariables | undefined,
  explicitKey?: string
) {
  if (explicitKey) return explicitKey;
  const source = getQuerySignature(query);
  return `${source}::${JSON.stringify(variables ?? {})}`;
}

export function useCachedQuery<
  TData = any,
  TVariables extends OperationVariables = OperationVariables
>(
  query: DocumentNode,
  options: Options<TData, TVariables> = {}
): QueryResult<TData, TVariables, DefaultContext> {
  const { cacheTtlMs = DEFAULT_TTL, cacheKey, ...queryOptions } = options;
  const key = useMemo(
    () => getCacheKey(query, queryOptions.variables, cacheKey),
    [cacheKey, query, queryOptions.variables]
  );

  const baseFetchPolicy =
    queryOptions.fetchPolicy ?? ("cache-and-network" as const);
  const baseNextFetchPolicy =
    queryOptions.nextFetchPolicy ??
    (baseFetchPolicy === "no-cache" ? "no-cache" : "cache-first");

  const ttlEnabled =
    cacheTtlMs > 0 &&
    baseFetchPolicy !== "no-cache" &&
    baseFetchPolicy !== "network-only";

  const initialSkip = useMemo(() => {
    if (!ttlEnabled) return false;
    const last = queryTimestamps.get(key);
    return typeof last === "number" && Date.now() - last < cacheTtlMs;
  }, [cacheTtlMs, key, ttlEnabled]);

  const [skipNetwork, setSkipNetwork] = useState(initialSkip);

  useEffect(() => {
    setSkipNetwork(initialSkip);
  }, [initialSkip]);

  useEffect(() => {
    if (!ttlEnabled || !skipNetwork) return;
    const last = queryTimestamps.get(key);
    const remaining = last ? cacheTtlMs - (Date.now() - last) : 0;
    if (remaining <= 0) {
      setSkipNetwork(false);
      return;
    }
    const timer = setTimeout(() => setSkipNetwork(false), remaining);
    return () => clearTimeout(timer);
  }, [cacheTtlMs, key, skipNetwork, ttlEnabled]);

  const result = useQuery<TData, TVariables>(query, {
    ...queryOptions,
    fetchPolicy:
      skipNetwork && ttlEnabled ? "cache-first" : baseFetchPolicy,
    nextFetchPolicy: baseNextFetchPolicy,
  });

  useEffect(() => {
    if (!ttlEnabled) return;
    if (result.loading || result.error || !result.data) return;
    queryTimestamps.set(key, Date.now());
    setSkipNetwork(true);
  }, [key, result.data, result.error, result.loading, ttlEnabled]);

  const refetch = useCallback(
    (variables?: Partial<TVariables> | undefined) => {
      queryTimestamps.delete(key);
      setSkipNetwork(false);
      return result.refetch(variables);
    },
    [key, result.refetch]
  );

  return { ...result, refetch };
}
