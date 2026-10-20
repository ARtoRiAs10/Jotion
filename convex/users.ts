import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getIdentity, getUserId, identityName } from "./helpers";

/**
 * Keeps a local mirror of the Clerk profile so that we can query users by
 * internal id (mentions, comments, members) without hitting Clerk.
 */
export const syncUser = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const clerkId = identity.subject;
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
      .first();

    const payload = {
      clerkId,
      email: args.email ?? existing?.email ?? identity.email ?? "",
      name: args.name ?? existing?.name ?? identityName(identity),
      avatarUrl: args.avatarUrl ?? existing?.avatarUrl,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    const id = await ctx.db.insert("users", {
      ...payload,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await getIdentity(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject))
      .first();
    return {
      clerkId: identity.subject,
      email: identity.email ?? user?.email ?? "",
      name: identity.name ?? user?.name ?? "Anonymous",
      avatarUrl: user?.avatarUrl,
      user: user ?? null,
    };
  },
});

export const getUserById = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", args.clerkId))
      .first();
    return user;
  },
});

/** All users of the current deployment, used for the @-mention picker. */
export const listUsers = query({
  handler: async (ctx) => {
    await getUserId(ctx);
    return await ctx.db.query("users").collect();
  },
});

export const getNotifications = query({
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    return notifications;
  },
});

export const markNotificationsRead = mutation({
  args: { ids: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const targets = args.ids
      ? notifications.filter((n) => args.ids!.includes(n._id))
      : notifications;
    for (const notification of targets) {
      await ctx.db.patch(notification._id, { read: true });
    }
    return targets.length;
  },
});
