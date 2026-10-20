import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getIdentity,
  getUserId,
  identityAvatar,
  identityName,
  logActivity,
  requireMembership,
  scheduleMail,
} from "./helpers";
import { templates } from "../lib/mailer";

export const list = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("asc")
      .collect();
    return comments;
  },
});

export const add = mutation({
  args: {
    documentId: v.id("documents"),
    body: v.string(),
    parentId: v.optional(v.id("comments")),
    mentions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Not found");
    if (document.workspaceId) {
      await requireMembership(ctx, document.workspaceId);
    }

    const id = await ctx.db.insert("comments", {
      documentId: args.documentId,
      authorId: userId,
      authorName: identityName(identity),
      authorAvatar: identityAvatar(identity),
      body: args.body,
      createdAt: Date.now(),
      parentId: args.parentId,
      resolved: false,
      mentions: args.mentions,
    });

    // Notify mentioned users.
    for (const mention of args.mentions ?? []) {
      if (mention === userId) continue;
      await ctx.db.insert("notifications", {
        userId: mention,
        workspaceId: document.workspaceId,
        documentId: args.documentId,
        actorId: userId,
        actorName: identityName(identity),
        type: "mention",
        body: args.body.slice(0, 140),
        read: false,
        createdAt: Date.now(),
      });

      // …and e-mail them (when an address is known).
      const mentioned = await ctx.db
        .query("users")
        .withIndex("by_clerk", (q) => q.eq("clerkId", mention))
        .first();
      if (mentioned?.email) {
        const mail = templates.mention(
          identityName(identity),
          document.title || "Untitled",
          args.body.slice(0, 400),
        );
        await scheduleMail(ctx, {
          to: mentioned.email,
          subject: mail.subject,
          body: mail.body,
        });
      }
    }

    await logActivity(ctx, {
      workspaceId: document.workspaceId,
      userId,
      userName: identityName(identity),
      action: "comment.created",
      documentId: args.documentId,
      metadata: { body: args.body.slice(0, 140) },
    });

    return id;
  },
});

/**
 * A comment of an anonymous visitor of a published page.
 *
 * The page has to be published with the "Can comment" access, the visitor
 * only needs a name — no account is required.
 */
export const addPublic = mutation({
  args: {
    documentId: v.id("documents"),
    name: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Not found");
    if (!document.isPublished || document.publicAccess !== "comment") {
      throw new Error("This page does not accept comments");
    }

    const name = args.name.trim().slice(0, 60);
    const body = args.body.trim().slice(0, 2000);
    if (!name || !body) {
      throw new Error("A name and a comment are required");
    }

    // A very simple guard against spam: no links and not too many comments.
    if (/https?:\/\//i.test(body)) {
      throw new Error("Links are not allowed in comments");
    }

    const recent = await ctx.db
      .query("comments")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    const lastFiveMinutes = Date.now() - 5 * 60 * 1000;
    const recentCount = recent.filter(
      (comment) => comment.createdAt > lastFiveMinutes,
    ).length;
    if (recentCount >= 5) {
      throw new Error("Too many comments — please try again in a moment");
    }

    const id = await ctx.db.insert("comments", {
      documentId: args.documentId,
      authorId: "public",
      authorName: name,
      body,
      createdAt: Date.now(),
      resolved: false,
      isPublic: true,
    });

    return id;
  },
});

export const update = mutation({
  args: { id: v.id("comments"), body: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const comment = await ctx.db.get(args.id);
    if (!comment) throw new Error("Not found");
    if (comment.authorId !== userId) {
      throw new Error("You can only edit your own comments");
    }
    await ctx.db.patch(args.id, { body: args.body });
    return await ctx.db.get(args.id);
  },
});

export const remove = mutation({
  args: { id: v.id("comments") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const comment = await ctx.db.get(args.id);
    if (!comment) throw new Error("Not found");
    if (comment.authorId !== userId) {
      throw new Error("You can only delete your own comments");
    }
    await ctx.db.delete(args.id);
    return true;
  },
});

export const toggleResolved = mutation({
  args: { id: v.id("comments"), resolved: v.boolean() },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    await ctx.db.patch(args.id, { resolved: args.resolved });
    return await ctx.db.get(args.id);
  },
});
