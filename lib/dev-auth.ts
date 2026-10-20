"use client";

import { ConvexReactClient } from "convex/react";

/**
 * The development sign-in.
 *
 * It stores a JWT that was issued by the `devAuth` action and hands it to
 * the Convex client, so every query runs as that user. The token is only
 * ever issued by a deployment that has `ALLOW_DEV_AUTH=true` — the
 * production deployment cannot issue one.
 */

const STORAGE_KEY = "jotion-dev-token";

export interface DevUser {
  userId: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

const getClient = () => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return null;
  return new ConvexReactClient(url);
};

export const getDevToken = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
};

export const getDevUser = (): DevUser | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(`${STORAGE_KEY}-user`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DevUser;
  } catch {
    return null;
  }
};

export const signInAsDevUser = async (
  user: DevUser,
  token: string,
  client?: ConvexReactClient | null,
) => {
  window.localStorage.setItem(STORAGE_KEY, token);
  window.localStorage.setItem(`${STORAGE_KEY}-user`, JSON.stringify(user));
  const target = client ?? getClient();
  // Convex expects a function that returns the token.
  target?.setAuth(async () => token);
};

export const signOutDevUser = (client?: ConvexReactClient | null) => {
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(`${STORAGE_KEY}-user`);
  const target = client ?? getClient();
  target?.setAuth(async () => null);
};

/**
 * Restores the development session when the app starts.
 */
export const restoreDevSession = (client?: ConvexReactClient | null) => {
  const token = getDevToken();
  if (!token) return false;
  const target = client ?? getClient();
  target?.setAuth(async () => token);
  return true;
};
