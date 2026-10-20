"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConvexYjsProvider, colorForUser } from "@/lib/collaboration";
import type * as Y from "yjs";

export interface CollaborationSession {
  provider: ConvexYjsProvider;
  /** The Yjs fragment the editor has to use. */
  fragment: Y.XmlFragment;
  /** True when the page is open in more than one browser tab / user. */
  live: boolean;
}

/**
 * Connects a page to the collaborative editing state.
 *
 * The provider is created once per page, the Yjs updates are pulled from
 * Convex (reactively — the query re-runs when a new update arrives) and the
 * local updates are pushed back.
 */
export const useCollaboration = (
  documentId: Id<"documents"> | undefined,
  user: { name: string; id: string },
): CollaborationSession | null => {
  const state = useQuery(
    api.collaboration.get,
    documentId ? { documentId } : ("skip" as never),
  );
  const push = useMutation(api.collaboration.push);
  const setPresence = useMutation(api.collaboration.setPresence);
  const clearPresence = useMutation(api.collaboration.clearPresence);

  const providerRef = useRef<ConvexYjsProvider | null>(null);
  const [ready, setReady] = useState(false);

  const provider = useMemo(() => {
    if (!documentId) return null;
    if (providerRef.current) return providerRef.current;

    const instance = new ConvexYjsProvider({
      documentId,
      user: { name: user.name, color: colorForUser(user.id) },
      push: (update) => {
        push({ documentId, update }).catch(() => undefined);
      },
      leave: () => {
        clearPresence({ documentId, clientId: instance.clientId_ }).catch(
          () => undefined,
        );
      },
    });

    providerRef.current = instance;
    return instance;
  }, [documentId, user.id, user.name, push, clearPresence]);

  // Pull the updates that arrived on the server into the local document.
  useEffect(() => {
    if (!provider || !state) return;
    provider.applyUpdates(state.updates);
    provider.awareness.setRemoteStates(state.presence);

    if (!ready) {
      setReady(true);
      // Announce that we are here.
      if (!documentId) return;
      setPresence({
        documentId,
        clientId: provider.clientId_,
        name: user.name,
        color: colorForUser(user.id),
      }).catch(() => undefined);
    }
  }, [provider, state, ready, documentId, setPresence, user.id, user.name]);

  // Leave the page when it is closed.
  useEffect(() => {
    const instance = provider;
    return () => {
      instance?.destroy();
      providerRef.current = null;
    };
  }, [provider]);

  return provider ? { provider, fragment: provider.fragment, live: (state?.presence.length ?? 0) > 1 } : null;
};
