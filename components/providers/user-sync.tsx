"use client";

import { useUser } from "@clerk/clerk-react";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";

/**
 * Keeps the local `users` mirror in sync with the Clerk profile. The mirror is
 * used to resolve names and avatars of members, comments and @mentions without
 * hitting Clerk for every read.
 */
export const UserSync = () => {
  const { user, isLoaded } = useUser();
  const syncUser = useMutation(api.users.syncUser);
  const synced = useRef(false);

  useEffect(() => {
    if (!isLoaded || !user || synced.current) return;
    synced.current = true;
    syncUser({
      name:
        user.fullName ??
        [user.firstName, user.lastName].filter(Boolean).join(" ") ??
        undefined,
      email: user.emailAddresses[0]?.emailAddress,
      avatarUrl: user.imageUrl,
    }).catch(() => {
      // The mirror is a convenience — failing to sync must never break the app.
      synced.current = false;
    });
  }, [isLoaded, user, syncUser]);

  return null;
};
