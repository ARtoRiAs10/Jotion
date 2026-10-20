"use client";

import * as Y from "yjs";

/**
 * A Yjs provider that syncs through Convex.
 *
 * The provider is deliberately small:
 *   - local updates are pushed to the server (debounced),
 *   - remote updates are pulled from the server and applied,
 *   - the presence (who is editing) is kept in sync as well.
 *
 * Because Yjs merges updates as a CRDT, two people editing the same page at
 * the same time never overwrite each other's changes.
 */

export interface PresenceState {
  clientId: string;
  name: string;
  color: string;
  blockId?: string;
}

type AwarenessHandler = () => void;

/** A minimal awareness object with the API BlockNote expects. */
class Awareness {
  private states = new Map<string, Record<string, unknown>>();
  private handlers = new Set<AwarenessHandler>();

  constructor(private readonly localClientId: string) {}

  setLocalState(state: Record<string, unknown>) {
    this.states.set(this.localClientId, state);
    this.emit();
  }

  setLocalStateField(field: string, value: unknown) {
    const current = this.states.get(this.localClientId) ?? {};
    this.states.set(this.localClientId, { ...current, [field]: value });
    this.emit();
  }

  getLocalState(): Record<string, unknown> | null {
    return this.states.get(this.localClientId) ?? null;
  }

  getStates(): Map<string, Record<string, unknown>> {
    return this.states;
  }

  /** Replaces the remote states (called by the provider). */
  setRemoteStates(states: PresenceState[]) {
    const next = new Map<string, Record<string, unknown>>();
    for (const state of states) {
      next.set(state.clientId, {
        user: { name: state.name, color: state.color },
        blockId: state.blockId,
      });
    }
    // Keep the local state.
    const local = this.states.get(this.localClientId);
    if (local) next.set(this.localClientId, local);
    this.states = next;
    this.emit();
  }

  on(event: "change", handler: AwarenessHandler) {
    if (event === "change") this.handlers.add(handler);
  }

  off(event: "change", handler: AwarenessHandler) {
    if (event === "change") this.handlers.delete(handler);
  }

  destroy() {
    this.handlers.clear();
  }

  private emit() {
    for (const handler of Array.from(this.handlers)) handler();
  }
}

export interface ConvexProviderOptions {
  documentId: string;
  /** Pushes an update to the server. */
  push: (update: string) => void;
  /** Removes the presence of this client. */
  leave: () => void;
  /** The identity of the local user. */
  user: { name: string; color: string };
}

const toBase64 = (update: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < update.length; index += 1) {
    binary += String.fromCharCode(update[index]);
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export class ConvexYjsProvider {
  readonly doc: Y.Doc;
  readonly fragment: Y.XmlFragment;
  readonly awareness: Awareness;

  private clientId: string;
  private applied = 0;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(private readonly options: ConvexProviderOptions) {
    this.doc = new Y.Doc();
    this.fragment = this.doc.getXmlFragment("blocknote");
    this.clientId = Math.random().toString(36).slice(2, 10);
    this.awareness = new Awareness(this.clientId);

    this.doc.on("update", this.handleUpdate);
  }

  private handleUpdate = (update: Uint8Array, origin: unknown) => {
    // Updates that come from the server are not pushed back.
    if (origin === "remote") return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.options.push(toBase64(update));
    }, 250);
  };

  /** Applies the updates that came from the server. */
  applyUpdates(updates: string[]) {
    if (this.destroyed) return;
    for (const update of updates.slice(this.applied)) {
      try {
        Y.applyUpdate(this.doc, fromBase64(update), "remote");
      } catch {
        // A broken update must not break the editor.
      }
    }
    this.applied = Math.max(this.applied, updates.length);
  }

  /** Updates the presence of the local user. */
  setPresence(presence: Omit<PresenceState, "clientId">) {
    this.awareness.setLocalState({
      user: { name: presence.name, color: presence.color },
      blockId: presence.blockId,
    });
  }

  get clientId_() {
    return this.clientId;
  }

  destroy() {
    this.destroyed = true;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.doc.off("update", this.handleUpdate);
    this.awareness.destroy();
    this.options.leave();
    this.doc.destroy();
  }
}

/** A colour for the collaborator cursor, derived from the user id. */
export const colorForUser = (seed: string) => {
  const palette = [
    "#E8384F",
    "#E4A11B",
    "#2B9C5B",
    "#1B84E4",
    "#8B46E4",
    "#E46B9B",
    "#12A5A5",
  ];
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100000;
  }
  return palette[hash % palette.length];
};
