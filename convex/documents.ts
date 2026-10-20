import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  assertBlockLimit,
  getIdentity,
  getPagePermission,
  getUserId,
  identityAvatar,
  identityName,
  logActivity,
  requireMembership,
} from "./helpers";
import { getPlan, WorkspaceRole } from "../lib/plans";
import { markdownToBlocks, titleFromMarkdown } from "../lib/markdown";
import { NotionImportDatabase, NotionImportPage } from "../lib/notion-import";

const now = () => Date.now();

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export const getSidebar = query({
  args: {
    parentDocument: v.optional(v.id("documents")),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;

    if (args.workspaceId) {
      await requireMembership(ctx, args.workspaceId);
      const documents = await ctx.db
        .query("documents")
        .withIndex("by_workspace_parent", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("parentDocument", args.parentDocument),
        )
        .filter((q) => q.eq(q.field("isArchived"), false))
        .order("desc")
        .collect();
      return documents;
    }

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user_parent", (q) =>
        q.eq("userId", userId).eq("parentDocument", args.parentDocument),
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc")
      .collect();

    return documents;
  },
});

export const getById = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const document = await ctx.db.get(args.documentId);

    if (!document) {
      throw new Error("Not found");
    }

    // The password of a protected page is never sent to the client — only
    // the fact that the page is protected.
    const sanitized = {
      ...document,
      password: undefined,
      hasPassword: Boolean(document.password),
    };

    if (document.isPublished && !document.isArchived) {
      return sanitized;
    }

    if (!identity) {
      throw new Error("Not authenticated");
    }

    if (document.workspaceId) {
      const membership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", document.workspaceId!).eq("userId", identity.subject),
        )
        .first();
      if (!membership) {
        throw new Error("Unauthorized");
      }
      if (document.isPrivate) {
        const isCreator = document.userId === identity.subject;
        const isAdmin = membership.role === "owner" || membership.role === "admin";
        if (!isCreator && !isAdmin) {
          throw new Error("Unauthorized");
        }
      }
      if (document.isRestricted) {
        const permission = await getPagePermission(
          ctx,
          args.documentId,
          identity.subject,
          membership.role as WorkspaceRole,
        );
        if (permission === "none") {
          throw new Error("Unauthorized");
        }
      }
      return sanitized;
    }

    if (document.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    return sanitized;
  },
});

/** The permission of the current user for a given page. */
export const getMyPermission = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Not found");
    if (!document.workspaceId) return "owner" as const;

    const membership = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", document.workspaceId!).eq("userId", identity.subject),
      )
      .first();
    if (!membership) return "none" as const;

    if (!document.isRestricted) {
      return membership.role === "guest" ? ("read" as const) : ("edit" as const);
    }

    return getPagePermission(
      ctx,
      args.documentId,
      identity.subject,
      membership.role as WorkspaceRole,
    );
  },
});

/** Everyone who has been given access to a page. */
export const listPageAccess = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const entries = await ctx.db
      .query("pageAccess")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    const withUsers = await Promise.all(
      entries.map(async (entry) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk", (q) => q.eq("clerkId", entry.userId))
          .first();
        return {
          _id: entry._id,
          userId: entry.userId,
          email: entry.email ?? user?.email,
          name: user?.name ?? entry.email ?? "Member",
          avatarUrl: user?.avatarUrl,
          permission: entry.permission,
          createdAt: entry.createdAt,
        };
      }),
    );

    return withUsers;
  },
});

/** Grants a person access to a page. */
export const setPageAccess = mutation({
  args: {
    documentId: v.id("documents"),
    userId: v.optional(v.string()),
    email: v.optional(v.string()),
    permission: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Not found");

    if (document.workspaceId) {
      const { membership } = await requireMembership(ctx, document.workspaceId);
      if (membership.role === "guest") {
        throw new Error("Guests cannot change page permissions");
      }
    } else if (document.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const permission = ["read", "comment", "edit"].includes(args.permission)
      ? args.permission
      : "read";

    const targetUserId = args.userId ?? (args.email ? `pending:${args.email.toLowerCase()}` : undefined);
    if (!targetUserId) throw new Error("A user or an email address is required");

    const existing = await ctx.db
      .query("pageAccess")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .filter((q) => q.eq(q.field("userId"), targetUserId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        permission,
        email: args.email?.toLowerCase() ?? existing.email,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("pageAccess", {
      documentId: args.documentId,
      userId: targetUserId,
      email: args.email?.toLowerCase(),
      permission,
      grantedBy: userId,
      createdAt: Date.now(),
    });

    await logActivity(ctx, {
      workspaceId: document.workspaceId,
      userId,
      userName: identityName(identity),
      action: "page.access_granted",
      documentId: args.documentId,
      metadata: { permission, email: args.email },
    });

    return id;
  },
});

/** Removes an access entry. */
export const removePageAccess = mutation({
  args: { accessId: v.id("pageAccess") },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const entry = await ctx.db.get(args.accessId);
    if (!entry) throw new Error("Not found");

    const document = await ctx.db.get(entry.documentId);
    if (!document) throw new Error("Not found");

    if (document.workspaceId) {
      const { membership } = await requireMembership(ctx, document.workspaceId);
      if (membership.role === "guest") {
        throw new Error("Guests cannot change page permissions");
      }
    } else if (document.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.accessId);

    await logActivity(ctx, {
      workspaceId: document.workspaceId,
      userId: identity.subject,
      action: "page.access_revoked",
      documentId: entry.documentId,
    });

    return true;
  },
});

/**
 * Toggles between a "teamspace" page (everybody in the workspace can open
 * it) and a "restricted" page (only people with an access entry).
 */
export const setRestricted = mutation({
  args: { id: v.id("documents"), isRestricted: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const document = await ctx.db.get(args.id);
    if (!document) throw new Error("Not found");

    if (document.workspaceId) {
      const { membership } = await requireMembership(ctx, document.workspaceId);
      if (membership.role === "guest") {
        throw new Error("Guests cannot change page settings");
      }
    } else if (document.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, { isRestricted: args.isRestricted });

    await logActivity(ctx, {
      workspaceId: document.workspaceId,
      userId: identity.subject,
      action: args.isRestricted ? "page.restricted" : "page.unrestricted",
      documentId: args.id,
    });

    return await ctx.db.get(args.id);
  },
});

/** Verifies the password of a published page. */
export const verifyPublicPassword = mutation({
  args: {
    documentId: v.id("documents"),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document || !document.isPublished) {
      throw new Error("This page is not available");
    }
    if (!document.password) return true;
    if (document.password !== args.password) {
      throw new Error("Incorrect password");
    }
    return true;
  },
});

export const getTrash = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    let documents: Doc<"documents">[];
    if (args.workspaceId) {
      await requireMembership(ctx, args.workspaceId);
      documents = await ctx.db
        .query("documents")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .filter((q) => q.eq(q.field("isArchived"), true))
        .order("desc")
        .collect();
    } else {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("isArchived"), true))
        .order("desc")
        .collect();
    }

    return documents;
  },
});

export const getFavorites = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    if (args.workspaceId) {
      await requireMembership(ctx, args.workspaceId);
      const documents = await ctx.db
        .query("documents")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .filter((q) => q.eq(q.field("isFavorite"), true))
        .order("desc")
        .collect();
      return documents.filter((d) => !d.isArchived);
    }

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isFavorite"), true))
      .order("desc")
      .collect();
    return documents.filter((d) => !d.isArchived);
  },
});

export const getSearch = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const search = (args.search ?? "").trim().toLowerCase();

    let documents: Doc<"documents">[];
    if (args.workspaceId) {
      await requireMembership(ctx, args.workspaceId);
      documents = await ctx.db
        .query("documents")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .filter((q) => q.eq(q.field("isArchived"), false))
        .collect();
    } else {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("isArchived"), false))
        .collect();
    }

    if (!search) {
      return documents.sort((a, b) => (b.lastEditedAt ?? 0) - (a.lastEditedAt ?? 0));
    }

    return documents
      .filter((document) => {
        if (document.title.toLowerCase().includes(search)) return true;
        if (document.content && document.content.toLowerCase().includes(search)) return true;
        return false;
      })
      .sort((a, b) => (b.lastEditedAt ?? 0) - (a.lastEditedAt ?? 0));
  },
});

export const getRecent = query({
  args: { workspaceId: v.optional(v.id("workspaces")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const limit = args.limit ?? 10;

    let documents: Doc<"documents">[];
    if (args.workspaceId) {
      await requireMembership(ctx, args.workspaceId);
      documents = await ctx.db
        .query("documents")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .filter((q) => q.eq(q.field("isArchived"), false))
        .collect();
    } else {
      documents = await ctx.db
        .query("documents")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("isArchived"), false))
        .collect();
    }

    return documents
      .filter((d) => !d.parentDocument)
      .sort((a, b) => (b.lastEditedAt ?? 0) - (a.lastEditedAt ?? 0))
      .slice(0, limit);
  },
});

export const getAncestors = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const ancestors: { _id: Id<"documents">; title: string; icon?: string }[] = [];
    let current = await ctx.db.get(args.documentId);
    let guard = 0;
    while (current?.parentDocument && guard < 20) {
      guard += 1;
      const parent = await ctx.db.get(current.parentDocument);
      if (!parent) break;
      ancestors.unshift({
        _id: parent._id,
        title: parent.title,
        icon: parent.icon,
      });
      current = parent;
    }
    return ancestors;
  },
});

/**
 * The pages that mention this page through a "mention" property — the
 * "linked mentions" panel of Notion.
 */
export const getBacklinks = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await getUserId(ctx);

    const properties = await ctx.db
      .query("pageProperties")
      .filter((q) => q.eq(q.field("type"), "mention"))
      .collect();

    const referencing = properties.filter(
      (property) => property.value === args.documentId,
    );

    const pages = await Promise.all(
      referencing.map(async (property) => {
        const document = await ctx.db.get(property.documentId);
        if (!document || document.isArchived) return null;
        return {
          _id: document._id,
          title: document.title,
          icon: document.icon,
          propertyKey: property.key,
        };
      }),
    );

    return pages.filter((page): page is NonNullable<typeof page> => Boolean(page));
  },
});

/** The pages that can be mentioned — used by the mention picker. */
export const getMentionablePages = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    await getUserId(ctx);

    const userId = await getUserId(ctx);
    const pages = args.workspaceId
      ? await ctx.db
          .query("documents")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
          .filter((q) => q.eq(q.field("isArchived"), false))
          .collect()
      : await ctx.db
          .query("documents")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .filter((q) => q.eq(q.field("isArchived"), false))
          .collect();

    return pages
      .filter((page) => page.type !== "database")
      .map((page) => ({
        _id: page._id,
        title: page.title,
        icon: page.icon,
      }));
  },
});

export const getChildren = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Not found");
    if (document.workspaceId) {
      await requireMembership(ctx, document.workspaceId);
    }
    return await ctx.db
      .query("documents")
      .withIndex("by_parent", (q) => q.eq("parentDocument", args.documentId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();
  },
});

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

export const create = mutation({
  args: {
    title: v.optional(v.string()),
    parentDocument: v.optional(v.id("documents")),
    workspaceId: v.optional(v.id("workspaces")),
    type: v.optional(v.string()),
    icon: v.optional(v.string()),
    content: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const timestamp = now();

    const workspaceId = args.workspaceId;
    if (workspaceId) {
      const { membership } = await requireMembership(ctx, workspaceId);
      if (membership.role === "guest") {
        throw new Error("Guests cannot create pages");
      }
      const workspace = await ctx.db.get(workspaceId);
      if (workspace) {
        const plan = getPlan(workspace.plan);
        if (args.isPrivate && !plan.limits.privatePages) {
          throw new Error(
            `Private pages are not included in the ${plan.name} plan. Upgrade to create private pages.`,
          );
        }
        if (plan.limits.pages !== Number.POSITIVE_INFINITY) {
          const pages = await ctx.db
            .query("documents")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
            .collect();
          if (pages.length + 1 > plan.limits.pages) {
            throw new Error(
              `Your ${plan.name} plan supports up to ${plan.limits.pages} pages. Upgrade for unlimited pages.`,
            );
          }
        }
      }
    }

    const documentId = await ctx.db.insert("documents", {
      title: args.title ?? "Untitled",
      parentDocument: args.parentDocument,
      workspaceId,
      type: args.type ?? "page",
      icon: args.icon,
      content: args.content,
      userId,
      isArchived: false,
      isPublished: false,
      isFavorite: false,
      isTemplate: false,
      isPrivate: args.isPrivate ?? false,
      createdBy: userId,
      lastEditedBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastEditedAt: timestamp,
      publicAccess: "none",
    });

    await logActivity(ctx, {
      workspaceId,
      userId,
      userName: identityName(identity),
      userAvatar: identityAvatar(identity),
      action: "page.created",
      documentId,
      metadata: { title: args.title ?? "Untitled" },
    });

    return documentId;
  },
});

/**
 * Imports a Markdown document as a new page.
 */
export const importMarkdown = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    parentDocument: v.optional(v.id("documents")),
    title: v.optional(v.string()),
    markdown: v.string(),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const timestamp = now();

    if (args.workspaceId) {
      await requireMembership(ctx, args.workspaceId);
    }

    const blocks = markdownToBlocks(args.markdown);
    const title =
      args.title?.trim() || titleFromMarkdown(args.markdown) || "Imported page";

    const documentId = await ctx.db.insert("documents", {
      title,
      userId,
      workspaceId: args.workspaceId,
      parentDocument: args.parentDocument,
      type: "page",
      icon: args.icon ?? "📥",
      content: JSON.stringify(blocks),
      isArchived: false,
      isPublished: false,
      isFavorite: false,
      isTemplate: false,
      createdBy: userId,
      lastEditedBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastEditedAt: timestamp,
      publicAccess: "none",
    });

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      userName: identityName(identity),
      action: "page.imported",
      documentId,
      metadata: { title, blocks: blocks.length },
    });

    return documentId;
  },
});

/**
 * Imports a Notion export (pages and databases) into the workspace.
 */
export const importNotionExport = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    parentDocument: v.optional(v.id("documents")),
    pages: v.array(
      v.object({
        title: v.string(),
        content: v.string(),
        children: v.optional(v.any()),
      }),
    ),
    databases: v.array(
      v.object({
        title: v.string(),
        columns: v.array(v.string()),
        rows: v.array(v.array(v.string())),
        children: v.optional(v.any()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const timestamp = now();

    if (args.workspaceId) {
      await requireMembership(ctx, args.workspaceId);
    }

    const created: { pages: number; databases: number } = {
      pages: 0,
      databases: 0,
    };

    const createPage = async (
      page: NotionImportPage,
      parent: Id<"documents"> | undefined,
    ) => {
      const blocks = markdownToBlocks(page.content);
      const documentId = await ctx.db.insert("documents", {
        title: page.title,
        userId,
        workspaceId: args.workspaceId,
        parentDocument: parent,
        type: "page",
        icon: "📄",
        content: JSON.stringify(blocks),
        isArchived: false,
        isPublished: false,
        isFavorite: false,
        isTemplate: false,
        createdBy: userId,
        lastEditedBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastEditedAt: timestamp,
        publicAccess: "none",
      });
      created.pages += 1;

      for (const child of page.children ?? []) {
        await createPage(child, documentId);
      }
      return documentId;
    };

    const createDatabase = async (
      database: NotionImportDatabase,
      parent: Id<"documents"> | undefined,
    ) => {
      const databaseId = await ctx.db.insert("documents", {
        title: database.title,
        userId,
        workspaceId: args.workspaceId,
        parentDocument: parent,
        type: "database",
        icon: "🗃️",
        isArchived: false,
        isPublished: false,
        createdBy: userId,
        lastEditedBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastEditedAt: timestamp,
        publicAccess: "none",
      });
      created.databases += 1;

      // The columns of the CSV become the columns of the database.
      const keys: string[] = [];
      let order = 0;
      for (const column of database.columns) {
        if (!column) continue;
        const key = `${column.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${order}`;
        keys.push(key);
        await ctx.db.insert("databaseProperties", {
          databaseId,
          key,
          name: column,
          type: "text",
          options: [],
          order,
        });
        order += 1;
      }

      await ctx.db.insert("views", {
        databaseId,
        name: "All items",
        type: "table",
        order: 0,
      });

      // …and every row becomes a page with the values as properties.
      for (const row of database.rows) {
        const rowId = await ctx.db.insert("documents", {
          title: row[0] || "Untitled",
          userId,
          workspaceId: args.workspaceId,
          parentDocument: databaseId,
          type: "page",
          isArchived: false,
          isPublished: false,
          createdBy: userId,
          lastEditedBy: userId,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastEditedAt: timestamp,
          publicAccess: "none",
        });

        for (let index = 1; index < row.length; index += 1) {
          const key = keys[index];
          if (!key || !row[index]) continue;
          await ctx.db.insert("pageProperties", {
            documentId: rowId,
            key,
            type: "text",
            value: row[index],
            updatedAt: timestamp,
          });
        }
      }

      for (const child of database.children ?? []) {
        await createPage(child, databaseId);
      }
      return databaseId;
    };

    for (const page of args.pages) {
      await createPage(page, args.parentDocument);
    }
    for (const database of args.databases) {
      await createDatabase(database, args.parentDocument);
    }

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      userName: identityName(identity),
      action: "workspace.imported_from_notion",
      metadata: created,
    });

    return created;
  },
});

/**
 * Creates a page that mirrors the content of another page (a synced block).
 * The copy always shows the content of the source page.
 */
export const createSyncedCopy = mutation({
  args: {
    documentId: v.id("documents"),
    workspaceId: v.optional(v.id("workspaces")),
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const source = await ctx.db.get(args.documentId);
    if (!source) throw new Error("Not found");

    if (source.workspaceId) {
      await requireMembership(ctx, source.workspaceId);
    }

    const timestamp = now();
    const documentId = await ctx.db.insert("documents", {
      title: `${source.title || "Untitled"} (synced)`,
      userId,
      workspaceId: args.workspaceId ?? source.workspaceId,
      parentDocument: args.parentDocument,
      type: "page",
      icon: source.icon,
      syncedFrom: args.documentId,
      isArchived: false,
      isPublished: false,
      isFavorite: false,
      isTemplate: false,
      createdBy: userId,
      lastEditedBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastEditedAt: timestamp,
      publicAccess: "none",
    });

    await logActivity(ctx, {
      workspaceId: args.workspaceId ?? source.workspaceId,
      userId,
      userName: identityName(identity),
      action: "page.synced_copy_created",
      documentId,
      metadata: { source: args.documentId },
    });

    return documentId;
  },
});

/** The content of the page a synced page mirrors. */
export const getSyncedSource = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document?.syncedFrom) return null;

    const source = await ctx.db.get(document.syncedFrom);
    if (!source) return null;

    return {
      _id: source._id,
      title: source.title,
      icon: source.icon,
      content: source.content,
      updatedAt: source.updatedAt,
    };
  },
});

export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    coverImage: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
    isFullWidth: v.optional(v.boolean()),
    isLocked: v.optional(v.boolean()),
    publicAccess: v.optional(v.string()),
    password: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
    /** The `updatedAt` the editor loaded — used to detect conflicting edits. */
    baseUpdatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const { id, ...rest } = args;

    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Not found");

    if (existing.workspaceId) {
      const { membership } = await requireMembership(ctx, existing.workspaceId);
      if (existing.isRestricted) {
        const permission = await getPagePermission(
          ctx,
          id,
          userId,
          membership.role as WorkspaceRole,
        );
        if (permission !== "owner" && permission !== "edit") {
          throw new Error("You do not have permission to edit this page");
        }
      } else if (membership.role === "guest") {
        throw new Error("Guests cannot edit pages");
      }
    } else if (existing.userId !== userId) {
      throw new Error("Unauthorized");
    }

    // Only patch the fields that were actually provided. Convex treats an
    // explicit `undefined` as "remove this field", which would wipe out
    // required values (isPublished, ...) on every keystroke.
    const patch: Partial<Doc<"documents">> = {};
    if (rest.title !== undefined) patch.title = rest.title;
    if (rest.content !== undefined) patch.content = rest.content;
    if (rest.coverImage !== undefined) patch.coverImage = rest.coverImage;
    if (rest.icon !== undefined) patch.icon = rest.icon;
    if (rest.isPublished !== undefined) patch.isPublished = rest.isPublished;
    if (rest.isFullWidth !== undefined) patch.isFullWidth = rest.isFullWidth;
    if (rest.isLocked !== undefined) patch.isLocked = rest.isLocked;
    if (rest.publicAccess !== undefined) patch.publicAccess = rest.publicAccess;
    if (rest.password !== undefined) patch.password = rest.password;
    if (rest.isPrivate !== undefined) {
      const workspace = existing.workspaceId
        ? await ctx.db.get(existing.workspaceId)
        : null;
      const plan = getPlan(workspace?.plan ?? "free");
      if (rest.isPrivate && !plan.limits.privatePages) {
        throw new Error(
          `Private pages are not included in the ${plan.name} plan. Upgrade to create private pages.`,
        );
      }
      patch.isPrivate = rest.isPrivate;
    }

    // Optimistic concurrency: refuse to overwrite a page that was changed
    // by somebody else while this editor was open.
    if (
      rest.baseUpdatedAt !== undefined &&
      rest.content !== undefined &&
      existing.updatedAt &&
      existing.updatedAt > rest.baseUpdatedAt
    ) {
      throw new Error(
        "This page was edited by somebody else while you were working on it. Reload the page to see the latest version.",
      );
    }

    // The content of a synced page comes from its source.
    if (existing.syncedFrom && rest.content !== undefined) {
      throw new Error(
        "This page mirrors the content of another page. Edit the source page to change it.",
      );
    }

    if (rest.content !== undefined && existing.content !== rest.content) {
      const workspace = existing.workspaceId
        ? await ctx.db.get(existing.workspaceId)
        : null;
      assertBlockLimit(workspace?.plan ?? "free", rest.content);

      // Snapshot the previous state for the version history.
      const plan = getPlan(workspace?.plan ?? "free");
      if (plan.limits.versionHistoryDays > 0) {
        await ctx.db.insert("versions", {
          documentId: id,
          title: existing.title,
          content: existing.content,
          icon: existing.icon,
          coverImage: existing.coverImage,
          createdBy: existing.lastEditedBy,
          createdAt: existing.lastEditedAt ?? Date.now(),
        });

        const retention = plan.limits.versionHistoryDays * 24 * 60 * 60 * 1000;
        const versions = await ctx.db
          .query("versions")
          .withIndex("by_document", (q) => q.eq("documentId", id))
          .collect();
        for (const version of versions) {
          if (Date.now() - version.createdAt > retention) {
            await ctx.db.delete(version._id);
          }
        }
      }
    }

    await ctx.db.patch(id, {
      ...patch,
      lastEditedBy: userId,
      lastEditedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

export const archive = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Not found");

    if (existing.workspaceId) {
      await requireMembership(ctx, existing.workspaceId);
    } else if (existing.userId !== userId) {
      throw new Error("unauthorized");
    }

    const recursiveArchive = async (documentId: Id<"documents">) => {
      const children = await ctx.db
        .query("documents")
        .withIndex("by_parent", (q) => q.eq("parentDocument", documentId))
        .collect();
      for (const child of children) {
        await ctx.db.patch(child._id, { isArchived: true });
        await recursiveArchive(child._id);
      }
    };

    await ctx.db.patch(args.id, { isArchived: true });
    await recursiveArchive(args.id);

    await logActivity(ctx, {
      workspaceId: existing.workspaceId,
      userId,
      userName: identityName(identity),
      action: "page.archived",
      documentId: args.id,
      metadata: { title: existing.title },
    });

    return await ctx.db.get(args.id);
  },
});

export const restore = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Not found");

    if (existing.workspaceId) {
      await requireMembership(ctx, existing.workspaceId);
    } else if (existing.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const recursiveRestore = async (documentId: Id<"documents">) => {
      const children = await ctx.db
        .query("documents")
        .withIndex("by_parent", (q) => q.eq("parentDocument", documentId))
        .collect();
      for (const child of children) {
        await ctx.db.patch(child._id, { isArchived: false });
        await recursiveRestore(child._id);
      }
    };

    const options: Partial<Doc<"documents">> = { isArchived: false };

    if (existing.parentDocument) {
      const parent = await ctx.db.get(existing.parentDocument);
      if (parent?.isArchived) {
        options.parentDocument = undefined;
      }
    }

    await ctx.db.patch(args.id, options);
    await recursiveRestore(args.id);
    return await ctx.db.get(args.id);
  },
});

export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Not found existing document");

    if (existing.workspaceId) {
      await requireMembership(ctx, existing.workspaceId);
    } else if (existing.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.id);
    return true;
  },
});

export const removeIcon = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Not found");
    await ctx.db.patch(args.id, { icon: undefined });
    return await ctx.db.get(args.id);
  },
});

export const removeCoverImage = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Not found");
    await ctx.db.patch(args.id, { coverImage: undefined });
    return await ctx.db.get(args.id);
  },
});

export const toggleFavorite = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Not found");
    await ctx.db.patch(args.id, { isFavorite: !existing.isFavorite });
    return await ctx.db.get(args.id);
  },
});

export const duplicate = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Not found");

    if (existing.workspaceId) {
      await requireMembership(ctx, existing.workspaceId);
    } else if (existing.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const timestamp = now();
    const newId = await ctx.db.insert("documents", {
      title: `${existing.title} (copy)`,
      userId: existing.userId,
      workspaceId: existing.workspaceId,
      parentDocument: existing.parentDocument,
      content: existing.content,
      coverImage: existing.coverImage,
      icon: existing.icon,
      type: existing.type,
      isArchived: false,
      isFavorite: false,
      isPublished: false,
      publicAccess: "none",
      createdAt: timestamp,
      updatedAt: timestamp,
      lastEditedAt: timestamp,
      createdBy: userId,
      lastEditedBy: userId,
    });

    // Copy the children of the page.
    const children = await ctx.db
      .query("documents")
      .withIndex("by_parent", (q) => q.eq("parentDocument", args.id))
      .collect();

    for (const child of children) {
      await ctx.db.insert("documents", {
        title: child.title,
        userId: child.userId,
        workspaceId: child.workspaceId,
        content: child.content,
        coverImage: child.coverImage,
        icon: child.icon,
        type: child.type,
        isArchived: false,
        isPublished: false,
        isFavorite: false,
        isTemplate: child.isTemplate,
        createdBy: child.createdBy ?? userId,
        lastEditedBy: userId,
        parentDocument: newId,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastEditedAt: timestamp,
      });
    }

    return newId;
  },
});

export const move = mutation({
  args: {
    id: v.id("documents"),
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Not found");

    // Prevent moving a page into its own descendant.
    if (args.parentDocument) {
      let cursor: Id<"documents"> | undefined = args.parentDocument;
      while (cursor) {
        if (cursor === args.id) throw new Error("Cannot move a page into itself");
        const parent: Doc<"documents"> | null = await ctx.db.get(cursor);
        cursor = parent?.parentDocument;
      }
    }

    return await ctx.db.patch(args.id, {
      parentDocument: args.parentDocument,
      updatedAt: Date.now(),
    });
  },
});

export const setPublicAccess = mutation({
  args: {
    id: v.id("documents"),
    publicAccess: v.string(),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Not found");

    if (existing.workspaceId) {
      await requireMembership(ctx, existing.workspaceId);
    } else if (existing.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, {
      publicAccess: args.publicAccess,
      password: args.publicAccess === "none" ? undefined : args.password,
      isPublished: args.publicAccess !== "none",
    });
    const document = await ctx.db.get(args.id);

    await logActivity(ctx, {
      workspaceId: existing.workspaceId,
      userId,
      userName: identityName(identity),
      action: "page.shared",
      documentId: args.id,
      metadata: { publicAccess: args.publicAccess },
    });

    return document;
  },
});

export const setIcon = mutation({
  args: { id: v.id("documents"), icon: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Not found");
    await ctx.db.patch(args.id, { icon: args.icon, updatedAt: Date.now() });
    return await ctx.db.get(args.id);
  },
});

export const setCoverImage = mutation({
  args: { id: v.id("documents"), coverImage: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Not found");
    await ctx.db.patch(args.id, { coverImage: args.coverImage, updatedAt: Date.now() });
    return await ctx.db.get(args.id);
  },
});

export const lockPage = mutation({
  args: { id: v.id("documents"), isLocked: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Not found");
    if (existing.workspaceId) {
      const { membership } = await requireMembership(ctx, existing.workspaceId);
      if (membership.role === "guest") {
        throw new Error("Guests cannot change page settings");
      }
    } else if (existing.userId !== userId) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.id, { isLocked: args.isLocked });
    return await ctx.db.get(args.id);
  },
});

/** Set a page property (Status, Tags, Owner, ...). */
export const setProperty = mutation({
  args: {
    documentId: v.id("documents"),
    key: v.string(),
    type: v.string(),
    value: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const existing = await ctx.db
      .query("pageProperties")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .filter((q) => q.eq(q.field("key"), args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        type: args.type,
        value: args.value,
        options: args.options,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("pageProperties", {
      documentId: args.documentId,
      key: args.key,
      type: args.type,
      value: args.value,
      options: args.options,
      updatedAt: Date.now(),
    });
  },
});

export const getProperties = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pageProperties")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
  },
});

export const removeProperty = mutation({
  args: { documentId: v.id("documents"), key: v.string() },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const properties = await ctx.db
      .query("pageProperties")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const property of properties) {
      if (property.key === args.key) await ctx.db.delete(property._id);
    }
    return true;
  },
});
