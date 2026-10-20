import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  getIdentity,
  getUserId,
  identityName,
  logActivity,
  requireMembership,
} from "./helpers";

/**
 * Built-in templates. They are seeded on the client the first time a
 * workspace is created so that new users always have something to start
 * from (meeting notes, project tracker, weekly review, ...).
 */
export const DEFAULT_TEMPLATES = [
  {
    name: "Weekly review",
    icon: "📝",
    description: "Reflect on the week and plan the next one.",
    type: "page",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Weekly review" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "What went well this week?" }],
      },
      { type: "bulletListItem", content: [{ type: "text", text: " " }] },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "What could be better?" }],
      },
      { type: "bulletListItem", content: [{ type: "text", text: " " }] },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Top 3 priorities for next week" }],
      },
      {
        type: "numberedListItem",
        content: [{ type: "text", text: " " }],
      },
    ],
  },
  {
    name: "Meeting notes",
    icon: "🗒️",
    description: "Agenda, notes and action items.",
    type: "page",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Meeting notes" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Date: " }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Attendees: " }],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Agenda" }],
      },
      { type: "numberedListItem", content: [{ type: "text", text: " " }] },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Action items" }],
      },
      { type: "toDoItem", attrs: { checked: false }, content: [{ type: "text", text: " " }] },
    ],
  },
  {
    name: "Project tracker",
    icon: "🚀",
    description: "Track a project with a simple database.",
    type: "database",
    content: null,
  },
  {
    name: "Reading list",
    icon: "📚",
    description: "Keep track of the books you want to read.",
    type: "database",
    content: null,
  },
  {
    name: "Product spec",
    icon: "📄",
    description: "Problem, solution, rollout plan.",
    type: "page",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Product spec" }],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Problem" }],
      },
      { type: "paragraph", content: [{ type: "text", text: " " }] },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Proposal" }],
      },
      { type: "paragraph", content: [{ type: "text", text: " " }] },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Rollout plan" }],
      },
      { type: "bulletListItem", content: [{ type: "text", text: " " }] },
    ],
  },
  {
    name: "Getting started",
    icon: "👋",
    description: "A short guide to Jotion.",
    type: "page",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Welcome to Jotion" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Jotion is your connected workspace. Type / to insert blocks, drag with the six dots to reorder, and press ⌘K to search or run a command.",
          },
        ],
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Shortcuts" }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "⌘K — search & commands" }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "/ — insert a block" }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "@ — mention a teammate" }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "⌘⇧P — command palette" }],
      },
    ],
  },
];

export const list = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    if (args.workspaceId) {
      await requireMembership(ctx, args.workspaceId);
    }
    const templates = await ctx.db
      .query("templates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    return templates;
  },
});

export const create = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const id = await ctx.db.insert("templates", {
      workspaceId: args.workspaceId,
      name: args.name,
      description: args.description,
      icon: args.icon ?? "📄",
      content: args.content,
      type: args.type ?? "page",
      isDefault: false,
      createdAt: Date.now(),
    });
    return id;
  },
});

/**
 * Creates a page or a database from a template — including the properties
 * of the page and the columns and views of the database.
 */
export const createFromTemplate = mutation({
  args: {
    templateId: v.id("templates"),
    workspaceId: v.optional(v.id("workspaces")),
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    if (args.workspaceId) {
      await requireMembership(ctx, args.workspaceId);
    }

    const timestamp = Date.now();
    const isDatabase = template.type === "database";

    const documentId = await ctx.db.insert("documents", {
      title: template.name,
      userId,
      workspaceId: args.workspaceId,
      parentDocument: args.parentDocument,
      type: isDatabase ? "database" : "page",
      icon: template.icon ?? (isDatabase ? "🗃️" : "📄"),
      content: template.content,
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

    // The properties of the page template.
    for (const property of template.properties ?? []) {
      await ctx.db.insert("pageProperties", {
        documentId,
        key: property.key,
        type: property.type,
        value: property.value,
        updatedAt: timestamp,
      });
    }

    // The columns and views of the database template.
    if (isDatabase) {
      let order = 0;
      for (const column of template.columns ?? []) {
        await ctx.db.insert("databaseProperties", {
          databaseId: documentId,
          key: `${column.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${order}`,
          name: column.name,
          type: column.type,
          options: column.options,
          order,
        });
        order += 1;
      }

      const views = template.views?.length
        ? template.views
        : [{ name: "All items", type: "table" }];
      let viewOrder = 0;
      for (const view of views) {
        await ctx.db.insert("views", {
          databaseId: documentId,
          name: view.name,
          type: view.type,
          order: viewOrder,
        });
        viewOrder += 1;
      }
    }

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      userName: identityName(identity),
      action: "template.used",
      documentId,
      metadata: { template: template.name },
    });

    return documentId;
  },
});

/**
 * Saves a page (or a database) as a reusable template, including its
 * properties, columns and views.
 */
export const saveAsTemplate = mutation({
  args: {
    documentId: v.id("documents"),
    workspaceId: v.optional(v.id("workspaces")),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Not found");

    if (document.workspaceId) {
      await requireMembership(ctx, document.workspaceId);
    }

    const isDatabase = document.type === "database";
    const properties = await ctx.db
      .query("pageProperties")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();

    const columns = isDatabase
      ? await ctx.db
          .query("databaseProperties")
          .withIndex("by_database", (q) => q.eq("databaseId", args.documentId))
          .collect()
      : [];

    const views = isDatabase
      ? await ctx.db
          .query("views")
          .withIndex("by_database", (q) => q.eq("databaseId", args.documentId))
          .collect()
      : [];

    const id = await ctx.db.insert("templates", {
      workspaceId: args.workspaceId ?? document.workspaceId,
      name: args.name?.trim() || document.title || "Template",
      description: args.description,
      icon: document.icon,
      content: document.content,
      type: isDatabase ? "database" : "page",
      isDefault: false,
      properties: properties.map((property) => ({
        key: property.key,
        name: property.key,
        type: property.type,
        value: property.value,
      })),
      columns: columns.map((column) => ({
        name: column.name,
        type: column.type,
        options: column.options,
      })),
      views: views.map((view) => ({ name: view.name, type: view.type })),
      createdAt: Date.now(),
    });

    await logActivity(ctx, {
      workspaceId: args.workspaceId ?? document.workspaceId,
      userId,
      userName: identityName(identity),
      action: "template.created",
      documentId: args.documentId,
      metadata: { name: args.name ?? document.title },
    });

    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("templates") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const template = await ctx.db.get(args.id);
    if (!template) throw new Error("Not found");
    if (template.isDefault) throw new Error("Built-in templates cannot be removed");
    await ctx.db.delete(args.id);
    return true;
  },
});

/** Seeds the built-in templates for a workspace (idempotent). */
export const seedDefaults = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.workspaceId);
    const existing = await ctx.db
      .query("templates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    if (existing.length > 0) return existing.length;

    for (const template of DEFAULT_TEMPLATES) {
      await ctx.db.insert("templates", {
        workspaceId: args.workspaceId,
        name: template.name,
        description: template.description,
        icon: template.icon,
        content: template.content ? JSON.stringify(template.content) : undefined,
        type: template.type,
        isDefault: true,
        createdAt: Date.now(),
      });
    }
    return DEFAULT_TEMPLATES.length;
  },
});
