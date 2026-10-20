import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { getUserId, requireMembership, requireRole } from "./helpers";

export const list = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const limit = args.limit ?? 50;

    if (!args.workspaceId) {
      return await ctx.db
        .query("activity")
        .filter((q) => q.eq(q.field("userId"), userId))
        .order("desc")
        .take(limit);
    }

    await requireMembership(ctx, args.workspaceId);
    return await ctx.db
      .query("activity")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Paginated activity feed — used by the audit log in the settings screen so
 * that large workspaces do not have to load their whole history at once.
 */
export const listPaginated = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    if (!args.workspaceId) {
      return await ctx.db
        .query("activity")
        .filter((q) => q.eq(q.field("userId"), userId))
        .order("desc")
        .paginate({
          ...args.paginationOpts,
          numItems: args.paginationOpts.numItems ?? 25,
        });
    }

    await requireMembership(ctx, args.workspaceId);
    return await ctx.db
      .query("activity")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: args.paginationOpts.numItems ?? 25,
      });
  },
});

/** Audit log — only owners & admins can see the full trail. */
export const auditLog = query({
  args: { workspaceId: v.id("workspaces"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.workspaceId, ["owner", "admin"]);
    return await ctx.db
      .query("activity")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/** Paginated audit log for the settings screen. */
export const auditLogPaginated = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.workspaceId, ["owner", "admin"]);
    return await ctx.db
      .query("activity")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: args.paginationOpts.numItems ?? 25,
      });
  },
});

export const clear = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.workspaceId, ["owner"]);
    const entries = await ctx.db
      .query("activity")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }
    return entries.length;
  },
});
