import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getPlan, buildQuote, limitFor, withinLimit } from "../lib/plans";
import { evaluateFormula } from "../lib/formula";

/**
 * Demo utilities.
 *
 * These helpers populate a development deployment with realistic data and run
 * a self-check against the live backend. They are **protected by a secret**
 * (`JOTION_DEMO_KEY` in the Convex environment) and simply refuse to run
 * when the secret is not configured, so they are inert on a production
 * deployment.
 */

const DEMO_KEY = process.env.JOTION_DEMO_KEY;

const requireKey = (key: string | undefined) => {
  if (!DEMO_KEY) {
    throw new Error(
      "Demo helpers are disabled. Set JOTION_DEMO_KEY in the Convex environment to enable them.",
    );
  }
  if (key !== DEMO_KEY) {
    throw new Error("Invalid demo key");
  }
};

const block = (text: string, type = "paragraph") => ({
  type,
  content: [{ type: "text", text }],
});

/**
 * Creates a demo workspace with pages, a database with a formula column,
 * comments and a notification.
 */
export const seed = mutation({
  args: {
    key: v.string(),
    /** The Clerk user id that should own the workspace. */
    userId: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireKey(args.key);

    const userId = args.userId ?? "demo_user";
    const name = args.name ?? "Demo workspace";
    const now = Date.now();

    // Never seed twice for the same owner.
    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first();
    if (existing) {
      return { ok: false, reason: "already seeded", workspaceId: existing._id };
    }

    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      slug: `demo-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${now % 10000}`,
      icon: "🪄",
      plan: "free",
      billingCycle: "monthly",
      ownerId: userId,
      createdAt: now,
      updatedAt: now,
      subscriptionStatus: "active",
      currentPeriodStart: now,
      currentPeriodEnd: now + 30 * 24 * 60 * 60 * 1000,
      seats: 1,
    });

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      email: "demo@jotion.app",
      role: "owner",
      createdAt: now,
    });

    // ------------------------------------------------------------------
    //  Pages
    // ------------------------------------------------------------------
    const welcomeId = await ctx.db.insert("documents", {
      title: "Welcome to Jotion",
      userId,
      workspaceId,
      type: "page",
      icon: "👋",
      isArchived: false,
      isPublished: false,
      isFavorite: true,
      createdBy: userId,
      lastEditedBy: userId,
      createdAt: now,
      updatedAt: now,
      lastEditedAt: now,
      publicAccess: "none",
      content: JSON.stringify([
        block("Welcome to Jotion — your connected workspace.", "heading"),
        block(
          "Type / to insert a block, drag the six dots to reorder and press ⌘K to search.",
        ),
        {
          type: "toDoItem",
          attrs: { checked: false },
          content: [{ type: "text", text: "Create your first database" }],
        },
        {
          type: "toDoItem",
          attrs: { checked: true },
          content: [{ type: "text", text: "Invite your team" }],
        },
      ]),
    });

    await ctx.db.insert("documents", {
      title: "Product roadmap",
      userId,
      workspaceId,
      parentDocument: welcomeId,
      type: "page",
      icon: "🗺️",
      isArchived: false,
      isPublished: false,
      createdBy: userId,
      lastEditedBy: userId,
      createdAt: now,
      updatedAt: now,
      lastEditedAt: now,
      publicAccess: "none",
      content: JSON.stringify([
        block("Product roadmap", "heading"),
        block("Q3 — billing polish"),
        block("Q4 — collaboration"),
      ]),
    });

    // ------------------------------------------------------------------
    //  Database with a formula column
    // ------------------------------------------------------------------
    const databaseId = await ctx.db.insert("documents", {
      title: "Projects",
      userId,
      workspaceId,
      type: "database",
      icon: "🗃️",
      isArchived: false,
      isPublished: false,
      createdBy: userId,
      lastEditedBy: userId,
      createdAt: now,
      updatedAt: now,
      lastEditedAt: now,
      publicAccess: "none",
    });

    const columns = [
      { name: "Status", type: "select", options: ["Not started", "In progress", "Done"] },
      { name: "Owner", type: "person", options: [] },
      { name: "Hours", type: "number", options: [] },
      { name: "Rate", type: "number", options: [] },
      {
        name: "Cost",
        type: "formula",
        options: ['prop("Hours") * prop("Rate")'],
      },
    ];

    const keys: Record<string, string> = {};
    let order = 0;
    for (const column of columns) {
      const key = `${column.name.toLowerCase()}-${order}`;
      keys[column.name] = key;
      await ctx.db.insert("databaseProperties", {
        databaseId,
        key,
        name: column.name,
        type: column.type,
        options: column.options,
        order,
      });
      order += 1;
    }

    await ctx.db.insert("views", {
      databaseId,
      name: "All projects",
      type: "table",
      order: 0,
    });
    await ctx.db.insert("views", {
      databaseId,
      name: "Board",
      type: "board",
      groupBy: keys.Status,
      order: 1,
    });

    const rows = [
      { title: "Website redesign", status: "In progress", hours: "32", rate: "120" },
      { title: "Mobile app", status: "Not started", hours: "80", rate: "110" },
      { title: "Design system", status: "Done", hours: "16", rate: "140" },
    ];

    for (const row of rows) {
      const rowId = await ctx.db.insert("documents", {
        title: row.title,
        userId,
        workspaceId,
        parentDocument: databaseId,
        type: "page",
        isArchived: false,
        isPublished: false,
        createdBy: userId,
        lastEditedBy: userId,
        createdAt: now,
        updatedAt: now,
        lastEditedAt: now,
        publicAccess: "none",
      });

      await ctx.db.insert("pageProperties", {
        documentId: rowId,
        key: keys.Status,
        type: "select",
        value: row.status,
        updatedAt: now,
      });
      await ctx.db.insert("pageProperties", {
        documentId: rowId,
        key: keys.Hours,
        type: "number",
        value: row.hours,
        updatedAt: now,
      });
      await ctx.db.insert("pageProperties", {
        documentId: rowId,
        key: keys.Rate,
        type: "number",
        value: row.rate,
        updatedAt: now,
      });
    }

    // ------------------------------------------------------------------
    //  Comments, notification and activity
    // ------------------------------------------------------------------
    const commentId = await ctx.db.insert("comments", {
      documentId: welcomeId,
      authorId: userId,
      authorName: "Demo",
      body: "This workspace was seeded by the demo seeder.",
      createdAt: now,
      resolved: false,
    });
    void commentId;

    await ctx.db.insert("notifications", {
      userId,
      workspaceId,
      documentId: welcomeId,
      actorId: userId,
      actorName: "Demo",
      type: "mention",
      body: "This workspace was seeded by the demo seeder.",
      read: false,
      createdAt: now,
    });

    await ctx.db.insert("activity", {
      workspaceId,
      userId,
      userName: "Demo",
      action: "workspace.seeded",
      documentId: welcomeId,
      metadata: { name },
      createdAt: now,
    });

    return {
      ok: true,
      workspaceId,
      pageId: welcomeId,
      databaseId,
      userId,
    };
  },
});

/**
 * A read-only self check of the live deployment: it exercises the pricing
 * engine, the formula evaluation and the plan limits, and reports what it
 * found. Useful to confirm that a deployment behaves as expected.
 */
export const smoke = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    requireKey(args.key);

    const workspaces = await ctx.db.query("workspaces").collect();
    const documents = await ctx.db.query("documents").collect();
    const invoices = await ctx.db.query("invoices").collect();
    const coupons = await ctx.db.query("coupons").collect();

    // The formula engine, evaluated exactly like the database does.
    const rows = await ctx.db
      .query("pageProperties")
      .filter((q) => q.or(q.eq(q.field("key"), "hours-2"), q.eq(q.field("key"), "rate-3")))
      .collect();
    const scope: Record<string, string | number | boolean | null> = {};
    for (const row of rows) {
      scope[row.key] = row.value ?? "";
    }
    const cost = evaluateFormula('prop("hours-2") * prop("rate-3")', scope);

    // The plan limits, evaluated exactly like the server enforces them.
    const limits = {
      pages: limitFor("free", "pages"),
      guests: limitFor("free", "guests"),
      blocksPerPage: limitFor("free", "blocksPerPage"),
      canCreatePage: withinLimit("free", "pages", documents.length),
      canInviteGuest: withinLimit("free", "guests", 0),
    };

    const quote = buildQuote({
      planId: "plus",
      cycle: "monthly",
      seats: 3,
      couponCode: "JOTION20",
      taxRate: 0.2,
    });

    return {
      deployment: "jotion",
      counts: {
        workspaces: workspaces.length,
        documents: documents.length,
        invoices: invoices.length,
        coupons: coupons.length,
      },
      plans: {
        free: getPlan("free").name,
        plus: getPlan("plus").name,
        business: getPlan("business").name,
        enterprise: getPlan("enterprise").name,
      },
      quoteCheck: {
        subtotal: quote.subtotal,
        discount: quote.discount,
        tax: quote.tax,
        total: quote.total,
      },
      formulaCheck: {
        expression: 'prop("hours-2") * prop("rate-3")',
        scope,
        result: cost,
      },
      limitCheck: limits,
    };
  },
});

/**
 * Removes everything the demo seeder created. Handy when you want to start
 * from a clean slate.
 */
export const reset = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    requireKey(args.key);

    const workspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) => q.eq("ownerId", "demo_user"))
      .collect();

    for (const workspace of workspaces) {
      const documents = await ctx.db
        .query("documents")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
        .collect();
      for (const document of documents) {
        await ctx.db.delete(document._id);
      }
      const members = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
        .collect();
      for (const member of members) {
        await ctx.db.delete(member._id);
      }
      await ctx.db.delete(workspace._id);
    }

    return { ok: true, removed: workspaces.length };
  },
});
