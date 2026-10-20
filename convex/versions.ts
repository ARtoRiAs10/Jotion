import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getIdentity,
  getUserId,
  identityName,
  requireMembership,
} from "./helpers";

export const list = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const versions = await ctx.db
      .query("versions")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .collect();
    return versions;
  },
});

/** Manually create a named snapshot of the current page. */
export const create = mutation({
  args: { documentId: v.id("documents"), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Not found");
    if (document.workspaceId) {
      await requireMembership(ctx, document.workspaceId);
    }

    const id = await ctx.db.insert("versions", {
      documentId: args.documentId,
      title: document.title,
      content: document.content,
      icon: document.icon,
      coverImage: document.coverImage,
      createdBy: userId,
      createdByName: identityName(identity),
      createdAt: Date.now(),
      label: args.label,
    });

    return id;
  },
});

export const restore = mutation({
  args: { versionId: v.id("versions") },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const version = await ctx.db.get(args.versionId);
    if (!version) throw new Error("Not found");
    const document = await ctx.db.get(version.documentId);
    if (!document) throw new Error("Not found");
    if (document.workspaceId) {
      await requireMembership(ctx, document.workspaceId);
    }

    // Snapshot the current state before restoring.
    await ctx.db.insert("versions", {
      documentId: version.documentId,
      title: document.title,
      content: document.content,
      icon: document.icon,
      coverImage: document.coverImage,
      createdBy: userId,
      createdByName: identityName(identity),
      createdAt: Date.now(),
      label: "Before restore",
    });

    await ctx.db.patch(version.documentId, {
      title: version.title,
      content: version.content,
      icon: version.icon,
      coverImage: version.coverImage,
      lastEditedBy: userId,
      lastEditedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return await ctx.db.get(version.documentId);
  },
});

export const remove = mutation({
  args: { versionId: v.id("versions") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const version = await ctx.db.get(args.versionId);
    if (!version) throw new Error("Not found");
    await ctx.db.delete(args.versionId);
    return true;
  },
});
