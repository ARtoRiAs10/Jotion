import { defineSchema, defineTable } from "convex/server";

import { v } from "convex/values";

export default defineSchema({
  /**
   * Mirror of a Clerk user. Kept in sync so that we can query users by
   * internal ids (mentions, comments, members) without hitting Clerk.
   */
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_email", ["email"]),

  /**
   * A workspace is the top level container (the "teamspace" in Notion).
   * Every page belongs to exactly one workspace.
   */
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    icon: v.optional(v.string()),
    plan: v.optional(v.string()),
    billingCycle: v.optional(v.string()),
    ownerId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    trialEndsAt: v.optional(v.number()),
    subscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    canceledAt: v.optional(v.number()),
    /** When the current billing period started (used for proration). */
    currentPeriodStart: v.optional(v.number()),
    /** A downgrade that is scheduled for the end of the current period. */
    scheduledPlan: v.optional(v.string()),
    scheduledCycle: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
    /** Tax rate applied to invoices (0.2 = 20% VAT). */
    taxRate: v.optional(v.number()),
    billingEmail: v.optional(v.string()),
    billingAddress: v.optional(v.string()),
    billingCountry: v.optional(v.string()),
    /** Number of seats that were purchased for the workspace. */
    seats: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_slug", ["slug"]),

  /**
   * Membership of a user inside a workspace.
   * role: owner | admin | member | guest
   */
  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    email: v.optional(v.string()),
    role: v.string(),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"]),

  /**
   * Pages & databases. `type` distinguishes a regular page from a database.
   */
  documents: defineTable({
    title: v.string(),
    userId: v.string(),
    isArchived: v.boolean(),
    parentDocument: v.optional(v.id("documents")),
    content: v.optional(v.string()),
    coverImage: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublished: v.boolean(),
    workspaceId: v.optional(v.id("workspaces")),
    type: v.optional(v.string()),
    isFavorite: v.optional(v.boolean()),
    isTemplate: v.optional(v.boolean()),
    createdBy: v.optional(v.string()),
    lastEditedBy: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    lastEditedAt: v.optional(v.number()),
    publicAccess: v.optional(v.string()),
    publicToken: v.optional(v.string()),
    password: v.optional(v.string()),
    isFullWidth: v.optional(v.boolean()),
    isLocked: v.optional(v.boolean()),
    /** When true only people with an explicit access entry can open it. */
    isRestricted: v.optional(v.boolean()),
    /** A private page is only visible to its creator and the workspace admins. */
    isPrivate: v.optional(v.boolean()),
    /**
     * A synced page mirrors the content of another page. Every copy shows
     * the content of the source page and updates automatically.
     */
    syncedFrom: v.optional(v.id("documents")),
  })
    .index("by_user", ["userId"])
    .index("by_user_parent", ["userId", "parentDocument"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_parent", ["workspaceId", "parentDocument"])
    .index("by_parent", ["parentDocument"]),

  /**
   * Page properties (Status, Tags, Owner, Due date, ...).
   */
  pageProperties: defineTable({
    documentId: v.id("documents"),
    key: v.string(),
    type: v.string(),
    value: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
    updatedAt: v.optional(v.number()),
  })
    .index("by_document", ["documentId"]),

  /**
   * Columns of a database.
   */
  databaseProperties: defineTable({
    databaseId: v.id("documents"),
    key: v.string(),
    name: v.string(),
    type: v.string(),
    options: v.optional(v.array(v.string())),
    order: v.number(),
  })
    .index("by_database", ["databaseId"]),

  /**
   * Saved views of a database (table / board / list / gallery / calendar).
   */
  views: defineTable({
    databaseId: v.id("documents"),
    name: v.string(),
    type: v.string(),
    groupBy: v.optional(v.string()),
    filters: v.optional(v.any()),
    sorts: v.optional(v.any()),
    order: v.number(),
  })
    .index("by_database", ["databaseId"]),

  /**
   * Comments & discussion threads.
   */
  comments: defineTable({
    documentId: v.id("documents"),
    authorId: v.string(),
    authorName: v.optional(v.string()),
    authorAvatar: v.optional(v.string()),
    body: v.string(),
    createdAt: v.number(),
    parentId: v.optional(v.id("comments")),
    resolved: v.optional(v.boolean()),
    mentions: v.optional(v.array(v.string())),
  })
    .index("by_document", ["documentId"]),

  /**
   * Version history snapshots.
   */
  versions: defineTable({
    documentId: v.id("documents"),
    title: v.string(),
    content: v.optional(v.string()),
    icon: v.optional(v.string()),
    coverImage: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    createdByName: v.optional(v.string()),
    createdAt: v.number(),
    label: v.optional(v.string()),
  })
    .index("by_document", ["documentId"]),

  /**
   * Audit trail of everything happening inside a workspace.
   */
  activity: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    userId: v.string(),
    userName: v.optional(v.string()),
    userAvatar: v.optional(v.string()),
    action: v.string(),
    documentId: v.optional(v.id("documents")),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"]),

  /**
   * Templates (page templates + starter templates shipped with Jotion).
   */
  templates: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    name: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    /** The page properties the template creates. */
    properties: v.optional(
      v.array(
        v.object({
          key: v.string(),
          name: v.string(),
          type: v.string(),
          value: v.optional(v.string()),
        }),
      ),
    ),
    /** The columns a database template creates. */
    columns: v.optional(
      v.array(
        v.object({
          name: v.string(),
          type: v.string(),
          options: v.optional(v.array(v.string())),
        }),
      ),
    ),
    /** The views a database template creates. */
    views: v.optional(
      v.array(
        v.object({
          name: v.string(),
          type: v.string(),
        }),
      ),
    ),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"]),

  /**
   * Billing: invoices (including pending checkouts) and payments.
   *
   * All amounts are stored in **cents**.
   */
  invoices: defineTable({
    workspaceId: v.id("workspaces"),
    plan: v.string(),
    cycle: v.optional(v.string()),
    /** Total amount due, in cents (subtotal - discount + tax). */
    amount: v.number(),
    /** Undiscounted amount, in cents. */
    subtotal: v.optional(v.number()),
    /** Discount applied, in cents. */
    discount: v.optional(v.number()),
    /** Tax applied, in cents. */
    tax: v.optional(v.number()),
    currency: v.string(),
    status: v.string(),
    seats: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    createdAt: v.number(),
    invoiceNumber: v.string(),
    description: v.optional(v.string()),
    couponCode: v.optional(v.string()),
    /** Line items, e.g. ["Plus plan — 3 seats (monthly)"] */
    items: v.optional(v.array(v.string())),
    paidAt: v.optional(v.number()),
    /** Set for scheduled (downgrade) invoices that are not due yet. */
    scheduledFor: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"]),

  /**
   * Promo codes. Coupons can be created by workspace owners and applied at
   * checkout.
   */
  coupons: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    code: v.string(),
    percentOff: v.optional(v.number()),
    amountOff: v.optional(v.number()),
    /** Restrict to a list of plan ids (empty = every plan). */
    plans: v.optional(v.array(v.string())),
    description: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    maxRedemptions: v.optional(v.number()),
    redemptions: v.optional(v.number()),
    active: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_code", ["code"]),

  /**
   * Payment methods attached to a workspace (demo implementation — the card
   * details are never sent to a real payment processor).
   */
  paymentMethods: defineTable({
    workspaceId: v.id("workspaces"),
    brand: v.string(),
    last4: v.string(),
    expMonth: v.number(),
    expYear: v.number(),
    name: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"]),

  /**
   * The collaborative editing state of a page: the Yjs updates of the
   * document and the presence of the people who are editing it right now.
   */
  collaboration: defineTable({
    documentId: v.id("documents"),
    /** The Yjs updates, base64 encoded, in the order they arrived. */
    updates: v.array(v.string()),
    /** The number of updates that were ever pushed (the version). */
    version: v.number(),
    /** Who is editing the page right now. */
    presence: v.optional(
      v.array(
        v.object({
          clientId: v.string(),
          name: v.string(),
          color: v.string(),
          blockId: v.optional(v.string()),
        }),
      ),
    ),
    updatedAt: v.number(),
  })
    .index("by_document", ["documentId"]),

  /**
   * Automations: when a property of a row changes to a value, a set of
   * actions is executed (set another property, notify a person, ...).
   */
  automations: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    databaseId: v.id("documents"),
    name: v.string(),
    /** The property that triggers the automation. */
    triggerKey: v.string(),
    /** The value the property has to reach. */
    triggerValue: v.string(),
    /**
     * The actions to run:
     *   { type: "setProperty", key, value }
     *   { type: "notify", body }
     */
    actions: v.array(
      v.object({
        type: v.string(),
        key: v.optional(v.string()),
        value: v.optional(v.string()),
        body: v.optional(v.string()),
      }),
    ),
    enabled: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_database", ["databaseId"])
    .index("by_workspace", ["workspaceId"]),

  /**
   * Page level access: individual members can be given restricted access to
   * a page ("can view", "can comment", "can edit") even when the page is
   * restricted to the workspace.
   */
  pageAccess: defineTable({
    documentId: v.id("documents"),
    /** Clerk user id, or `pending:<email>` for people who have not signed up. */
    userId: v.string(),
    email: v.optional(v.string()),
    /** none | read | comment | edit */
    permission: v.string(),
    grantedBy: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_user", ["userId"]),

  /**
   * Notifications for mentions & comments.
   */
  notifications: defineTable({
    userId: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    documentId: v.optional(v.id("documents")),
    actorId: v.optional(v.string()),
    actorName: v.optional(v.string()),
    type: v.string(),
    body: v.optional(v.string()),
    read: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"]),
});
