import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  asRole,
  getIdentity,
  getMembership,
  getUserId,
  identityName,
  logActivity,
  requireMembership,
  requireRole,
  scheduleMail,
  serialiseLimit,
  serialiseLimits,
  uniqueSlug,
} from "./helpers";
import { templates } from "../lib/mailer";
import { getPlan, WorkspaceRole } from "../lib/plans";

export const list = query({
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId);
        if (!workspace) return null;
        return {
          ...workspace,
          role: membership.role as WorkspaceRole,
          isOwner: membership.role === "owner",
        };
      }),
    );

    return workspaces
      .filter((w): w is NonNullable<typeof w> => Boolean(w))
      .sort((a, b) => {
        if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
        return a.createdAt - b.createdAt;
      });
  },
});

export const get = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const { membership } = await requireMembership(ctx, args.workspaceId);
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Not found");
    return { ...workspace, role: membership.role as WorkspaceRole };
  },
});

/**
 * Creates the default (personal) workspace on first sign in and migrates any
 * legacy documents that were created before workspaces existed.
 */
export const ensureDefault = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const email = identity.email?.toLowerCase();

    // Claim the invitations that were sent to this e-mail address. Without
    // this step an invited member could never open the workspace.
    if (email) {
      const pending = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_user", (q) => q.eq("userId", `pending:${email}`))
        .collect();
      for (const membership of pending) {
        await ctx.db.patch(membership._id, { userId });
      }
    }

    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (existing.length > 0) {
      const first = await ctx.db.get(existing[0].workspaceId);
      if (first) return first;
    }

    const now = Date.now();
    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name ?? `${identity.name ?? "My"}'s Jotion`,
      slug: await uniqueSlug(ctx, args.name ?? "my-jotion"),
      icon: "🪄",
      plan: "free",
      billingCycle: "monthly",
      ownerId: userId,
      createdAt: now,
      updatedAt: now,
      subscriptionStatus: "active",
    });

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
      createdAt: now,
    });

    // Migrate legacy documents into the new workspace.
    const legacy = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const document of legacy) {
      if (!document.workspaceId) {
        await ctx.db.patch(document._id, {
          workspaceId,
          createdBy: document.createdBy ?? userId,
          lastEditedBy: document.lastEditedBy ?? userId,
          createdAt: document.createdAt ?? now,
          updatedAt: document.updatedAt ?? now,
          lastEditedAt: document.lastEditedAt ?? now,
          type: document.type ?? "page",
        });
      }
    }

    return await ctx.db.get(workspaceId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const now = Date.now();

    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      slug: await uniqueSlug(ctx, args.name),
      icon: args.icon ?? "🏠",
      plan: "free",
      billingCycle: "monthly",
      ownerId: userId,
      createdAt: now,
      updatedAt: now,
      subscriptionStatus: "active",
    });

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
      createdAt: now,
    });

    await logActivity(ctx, {
      workspaceId,
      userId,
      userName: identityName(identity),
      action: "workspace.created",
      metadata: { name: args.name },
    });

    return await ctx.db.get(workspaceId);
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.workspaceId, ["owner", "admin"]);
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Not found");
    if (args.name && args.name !== workspace.name) {
      const slug = await uniqueSlug(ctx, args.name);
      await ctx.db.patch(args.workspaceId, { name: args.name, slug, updatedAt: Date.now() });
    } else {
      await ctx.db.patch(args.workspaceId, {
        icon: args.icon,
        updatedAt: Date.now(),
      });
    }
    return await ctx.db.get(args.workspaceId);
  },
});

export const remove = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, args.workspaceId, ["owner"]);

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    for (const document of documents) {
      await ctx.db.delete(document._id);
    }

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    for (const member of members) {
      await ctx.db.delete(member._id);
    }

    await ctx.db.delete(args.workspaceId);

    await logActivity(ctx, {
      userId,
      action: "workspace.deleted",
      metadata: { workspaceId: args.workspaceId },
    });

    return true;
  },
});

export const listMembers = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.workspaceId);
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const withUsers = await Promise.all(
      members.map(async (member) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk", (q) => q.eq("clerkId", member.userId))
          .first();
        return {
          _id: member._id,
          userId: member.userId,
          role: member.role as WorkspaceRole,
          createdAt: member.createdAt,
          name: user?.name ?? member.email ?? "Member",
          email: user?.email ?? member.email,
          avatarUrl: user?.avatarUrl,
        };
      }),
    );

    return withUsers.sort((a, b) => {
      const rank: Record<string, number> = { owner: 0, admin: 1, member: 2, guest: 3 };
      return (rank[a.role] ?? 9) - (rank[b.role] ?? 9);
    });
  },
});

export const inviteMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, args.workspaceId, [
      "owner",
      "admin",
    ]);
    const role = asRole(args.role ?? "member");
    const identity = await getIdentity(ctx);
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Not found");

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const email = args.email.trim().toLowerCase();
    if (members.some((m) => (m.email ?? "").toLowerCase() === email)) {
      throw new Error("This person is already a member of the workspace");
    }

    // Enforce the guest & member limits of the current plan.
    const plan = getPlan(workspace.plan);
    if (role !== "guest" && plan.limits.members !== Number.POSITIVE_INFINITY) {
      const paidSeats = members.filter((m) => m.role !== "guest").length;
      if (paidSeats + 1 > plan.limits.members) {
        throw new Error(
          `Your ${plan.name} plan allows ${plan.limits.members} members. Upgrade to invite more people.`,
        );
      }
    }
    if (role === "guest" && plan.limits.guests !== Number.POSITIVE_INFINITY) {
      const guests = members.filter((m) => m.role === "guest").length;
      if (guests + 1 > plan.limits.guests) {
        throw new Error(
          `Your ${plan.name} plan allows ${plan.limits.guests} guests. Upgrade to invite more guests.`,
        );
      }
    }

    // If the invited person already has an account, add them directly.
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    const membershipId = await ctx.db.insert("workspaceMembers", {
      workspaceId: args.workspaceId,
      userId: user?.clerkId ?? `pending:${email}`,
      email,
      role,
      createdAt: Date.now(),
    });

    const mail = templates.invitation(workspace.name, role);
    await scheduleMail(ctx, {
      to: email,
      subject: mail.subject,
      body: mail.body,
    });

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      userName: identityName(identity),
      action: "member.invited",
      metadata: { email, role },
    });

    return membershipId;
  },
});

export const updateMemberRole = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    memberId: v.id("workspaceMembers"),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, args.workspaceId, [
      "owner",
      "admin",
    ]);
    const role = asRole(args.role);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.workspaceId !== args.workspaceId) {
      throw new Error("Member not found");
    }
    if (member.role === "owner" && role !== "owner") {
      throw new Error("The workspace owner cannot be demoted");
    }
    await ctx.db.patch(args.memberId, { role });
    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      action: "member.role_updated",
      metadata: { role },
    });
    return true;
  },
});

export const removeMember = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    memberId: v.id("workspaceMembers"),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireRole(ctx, args.workspaceId, [
      "owner",
      "admin",
    ]);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.workspaceId !== args.workspaceId) {
      throw new Error("Member not found");
    }
    if (member.role === "owner") {
      throw new Error("The workspace owner cannot be removed");
    }
    await ctx.db.delete(args.memberId);
    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      action: "member.removed",
      metadata: { email: member.email },
    });
    return true;
  },
});

export const getUsage = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const { membership } = await requireMembership(ctx, args.workspaceId);
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Not found");

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const pages = await ctx.db
      .query("documents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const plan = getPlan(workspace.plan);
    const guests = members.filter((m) => m.role === "guest").length;
    const seats = members.filter((m) => m.role !== "guest").length;

    return {
      plan: plan.id,
      planName: plan.name,
      limits: serialiseLimits(plan.limits),
      guests,
      guestsLimit: serialiseLimit(plan.limits.guests),
      seats,
      pages: pages.length,
      pagesLimit: serialiseLimit(plan.limits.pages),
      role: membership.role as WorkspaceRole,
    };
  },
});

export const getMemberRole = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const membership = await getMembership(ctx, args.workspaceId, userId);
    return membership ? (membership.role as WorkspaceRole) : null;
  },
});
