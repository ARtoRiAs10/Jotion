import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { PlanLimits, WorkspaceRole, getPlan } from "../lib/plans";

type Ctx = QueryCtx | MutationCtx;

export const getIdentity = async (ctx: Ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
};

export const getUserId = async (ctx: Ctx) => (await getIdentity(ctx)).subject;

type IdentityLike = {
  name?: string;
  avatarUrl?: unknown;
};

export const identityName = (identity: IdentityLike) =>
  identity.name ?? "Anonymous";

export const identityAvatar = (identity: IdentityLike) =>
  typeof identity.avatarUrl === "string" ? identity.avatarUrl : undefined;

export const getMembership = async (
  ctx: Ctx,
  workspaceId: Id<"workspaces">,
  userId?: string,
) => {
  const id = userId ?? (await getUserId(ctx));
  const membership = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", id),
    )
    .first();
  return membership;
};

export const requireMembership = async (
  ctx: Ctx,
  workspaceId: Id<"workspaces">,
) => {
  const userId = await getUserId(ctx);
  const membership = await getMembership(ctx, workspaceId, userId);
  if (!membership) {
    throw new Error("Unauthorized: you are not a member of this workspace");
  }
  return { userId, membership };
};

export const requireRole = async (
  ctx: Ctx,
  workspaceId: Id<"workspaces">,
  allowed: WorkspaceRole[],
) => {
  const { userId, membership } = await requireMembership(ctx, workspaceId);
  if (!allowed.includes(membership.role as WorkspaceRole)) {
    throw new Error("Forbidden: insufficient permissions");
  }
  return { userId, membership };
};

export const logActivity = async (
  ctx: MutationCtx,
  args: {
    workspaceId?: Id<"workspaces">;
    userId: string;
    userName?: string;
    userAvatar?: string;
    action: string;
    documentId?: Id<"documents">;
    metadata?: Record<string, unknown>;
  },
) => {
  await ctx.db.insert("activity", {
    workspaceId: args.workspaceId,
    userId: args.userId,
    userName: args.userName,
    userAvatar: args.userAvatar,
    action: args.action,
    documentId: args.documentId,
    metadata: args.metadata,
    createdAt: Date.now(),
  });
};

/** Count the number of blocks inside a serialised blocknote document. */
export const countBlocks = (content?: string | null) => {
  if (!content) return 0;
  try {
    const parsed = JSON.parse(content) as unknown[];
    if (!Array.isArray(parsed)) return 0;
    return parsed.length;
  } catch {
    return 0;
  }
};

/**
 * Enforces the "blocks per page" limit of the workspace plan.
 */
export const assertBlockLimit = (
  plan: string,
  content: string | undefined,
) => {
  const limits = getPlan(plan).limits;
  if (limits.blocksPerPage === Number.POSITIVE_INFINITY) return;
  const blocks = countBlocks(content);
  if (blocks > limits.blocksPerPage) {
    throw new Error(
      `Your plan allows up to ${limits.blocksPerPage} blocks per page. Upgrade to unlock unlimited blocks.`,
    );
  }
};

/**
 * Convex responses have to be JSON serialisable, and `Infinity` is not a
 * valid JSON number. Limits that are unlimited are therefore sent as
 * `null` — the client treats `null` as "unlimited".
 */
export const serialiseLimit = (limit: number) =>
  limit === Number.POSITIVE_INFINITY ? null : limit;

export const serialiseLimits = (limits: PlanLimits) => ({
  guests: serialiseLimit(limits.guests),
  blocksPerPage: serialiseLimit(limits.blocksPerPage),
  versionHistoryDays: serialiseLimit(limits.versionHistoryDays),
  fileUploadMb: serialiseLimit(limits.fileUploadMb),
  pages: serialiseLimit(limits.pages),
  privatePages: limits.privatePages,
  guestsAllowed: limits.guestsAllowed,
  databases: serialiseLimit(limits.databases),
  members: serialiseLimit(limits.members),
});

/**
 * Resolves what a user is allowed to do with a page.
 *
 * `none`   – no access at all
 * `read`   – can open the page
 * `comment`– can open the page and comment
 * `edit`   – can change the content
 * `owner`  – full control (including sharing)
 */
export const getPagePermission = async (
  ctx: Ctx,
  documentId: Id<"documents">,
  userId: string,
  role: WorkspaceRole = "member",
): Promise<"none" | "read" | "comment" | "edit" | "owner"> => {
  if (role === "owner" || role === "admin") return "owner";
  const entry = await ctx.db
    .query("pageAccess")
    .withIndex("by_document", (q) => q.eq("documentId", documentId))
    .filter((q) => q.eq(q.field("userId"), userId))
    .first();
  if (!entry) return "none";
  const permission = entry.permission as "read" | "comment" | "edit";
  return permission;
};

/**
 * Schedules an e-mail. The mail is sent by an internal action so that the
 * mutation stays fast and a failing mail provider never breaks a write.
 */
export const scheduleMail = async (
  ctx: MutationCtx,
  message: { to: string; subject: string; body: string },
) => {
  if (!message.to) return;
  try {
    await ctx.scheduler.runAfter(0, internal.mail.send, message);
  } catch {
    // Scheduling is best effort — never fail a mutation because of an e-mail.
  }
};

export const getDocument = async (ctx: Ctx, documentId: Id<"documents">) => {
  const document = await ctx.db.get(documentId);
  if (!document) {
    throw new Error("Not found");
  }
  return document;
};

export const isWorkspaceMember = async (
  ctx: Ctx,
  workspaceId: Id<"workspaces"> | undefined,
  userId: string,
) => {
  if (!workspaceId) return false;
  const membership = await getMembership(ctx, workspaceId, userId);
  return Boolean(membership);
};

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "workspace";

export const uniqueSlug = async (ctx: MutationCtx, name: string) => {
  const base = slugify(name);
  let slug = base;
  let counter = 1;
  while (await ctx.db.query("workspaces").withIndex("by_slug", (q) => q.eq("slug", slug)).first()) {
    counter += 1;
    slug = `${base}-${counter}`;
  }
  return slug;
};

export const asRole = (role: string): WorkspaceRole =>
  (["owner", "admin", "member", "guest"] as const).includes(role as WorkspaceRole)
    ? (role as WorkspaceRole)
    : "member";

export type DocumentRecord = Doc<"documents">;
