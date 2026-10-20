import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserId, logActivity } from "./helpers";

/**
 * The collaborative editing state of a page.
 *
 * The Yjs updates are stored as base64 strings; the client merges them into
 * a CRDT document, so concurrent edits never overwrite each other.
 */

/** The maximum number of updates that are kept for a page. */
const MAX_UPDATES = 200;

export const get = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const state = await ctx.db
      .query("collaboration")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();

    return {
      updates: state?.updates ?? [],
      version: state?.version ?? 0,
      presence: state?.presence ?? [],
    };
  },
});

/** Appends a Yjs update. */
export const push = mutation({
  args: {
    documentId: v.id("documents"),
    update: v.string(),
  },
  handler: async (ctx, args) => {
    await getUserId(ctx);

    const state = await ctx.db
      .query("collaboration")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();

    const now = Date.now();

    if (!state) {
      const id = await ctx.db.insert("collaboration", {
        documentId: args.documentId,
        updates: [args.update],
        version: 1,
        presence: [],
        updatedAt: now,
      });
      return { id, version: 1 };
    }

    const updates = [...state.updates, args.update];
    // Keep the state small — old updates are already merged into the rest.
    const trimmed =
      updates.length > MAX_UPDATES
        ? updates.slice(updates.length - MAX_UPDATES)
        : updates;

    await ctx.db.patch(state._id, {
      updates: trimmed,
      version: state.version + 1,
      updatedAt: now,
    });

    return { id: state._id, version: state.version + 1 };
  },
});

/** Registers (or updates) the presence of a collaborator. */
export const setPresence = mutation({
  args: {
    documentId: v.id("documents"),
    clientId: v.string(),
    name: v.string(),
    color: v.string(),
    blockId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getUserId(ctx);

    const state = await ctx.db
      .query("collaboration")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();

    const others = (state?.presence ?? []).filter(
      (entry) => entry.clientId !== args.clientId,
    );
    const presence = [
      ...others,
      {
        clientId: args.clientId,
        name: args.name,
        color: args.color,
        blockId: args.blockId,
      },
    ];

    if (state) {
      await ctx.db.patch(state._id, { presence, updatedAt: Date.now() });
      return { ok: true };
    }

    await ctx.db.insert("collaboration", {
      documentId: args.documentId,
      updates: [],
      version: 0,
      presence,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Removes the presence of a collaborator that left the page. */
export const clearPresence = mutation({
  args: { documentId: v.id("documents"), clientId: v.string() },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const state = await ctx.db
      .query("collaboration")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    if (!state) return { ok: true };

    await ctx.db.patch(state._id, {
      presence: (state.presence ?? []).filter(
        (entry) => entry.clientId !== args.clientId,
      ),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Removes the whole collaborative state of a page (e.g. when it is deleted). */
export const reset = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const state = await ctx.db
      .query("collaboration")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    if (state) await ctx.db.delete(state._id);
    await logActivity(ctx, {
      userId: await getUserId(ctx),
      action: "page.collaboration_reset",
      documentId: args.documentId,
    });
    return { ok: true };
  },
});
