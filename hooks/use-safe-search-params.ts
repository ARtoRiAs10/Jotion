"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

/**
 * A null-safe `useSearchParams()`.
 *
 * Next.js returns `null` from `useSearchParams()` while a route is
 * statically rendered (or outside of a request scope). Calling `.get()` on
 * that `null` crashes the page with
 * *"Cannot read properties of null (reading 'get')"* — this hook makes sure
 * there is always a `URLSearchParams` to work with.
 */
/**
 * The pure part of the hook — exported so it can be tested.
 */
export const resolveSearchParams = (
  params: URLSearchParams | null | undefined,
  fallbackSearch?: string,
) => {
  if (params) return params;
  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search);
  }
  return new URLSearchParams(fallbackSearch ?? "");
};

export const useSafeSearchParams = () => {
  const params = useSearchParams();

  return useMemo(() => resolveSearchParams(params), [params]);
};
