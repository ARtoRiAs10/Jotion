import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * The internal functions of the development sign-in. They are only reachable
 * from `convex/devAuth.ts`, which itself is disabled unless the deployment
 * has `ALLOW_DEV_AUTH=true`.
 */

/** The people that can use the development sign-in. */
export const listUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("devUsers").collect();
    return users.map((user) => ({
      userId: user.userId,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    }));
  },
});

export const getUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("devUsers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!user) return null;
    return {
      userId: user.userId,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    };
  },
});

/** Creates the development users (and the user mirror). */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const people = [
      { userId: "dev_ada", name: "Ada Lovelace", email: "ada@jotion.test" },
      { userId: "dev_linus", name: "Linus Torvalds", email: "linus@jotion.test" },
      { userId: "dev_grace", name: "Grace Hopper", email: "grace@jotion.test" },
    ];

    for (const person of people) {
      const existing = await ctx.db
        .query("devUsers")
        .withIndex("by_user", (q) => q.eq("userId", person.userId))
        .first();

      if (!existing) {
        await ctx.db.insert("devUsers", {
          ...person,
          createdAt: Date.now(),
        });
      }

      // The mirror of the user, so that names resolve everywhere.
      const mirror = await ctx.db
        .query("users")
        .withIndex("by_clerk", (q) => q.eq("clerkId", person.userId))
        .first();
      if (!mirror) {
        await ctx.db.insert("users", {
          clerkId: person.userId,
          name: person.name,
          email: person.email,
          createdAt: Date.now(),
        });
      }
    }

    return people.length;
  },
});

/** Keeps the user mirror in sync. */
export const upsertUser = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email ?? existing.email,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: args.userId,
      name: args.name,
      email: args.email ?? "",
      createdAt: Date.now(),
    });
  },
});
