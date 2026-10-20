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
import { getPlan } from "../lib/plans";
import { evaluateFormula, validateFormula } from "../lib/formula";

export const PROPERTY_TYPES = [
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "checkbox",
  "person",
  "url",
  "email",
  "phone",
  "formula",
  "relation",
  "rollup",
] as const;

/** The aggregations a rollup can use. */
export const ROLLUP_AGGREGATIONS = [
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "list",
] as const;

/**
 * Resolves the rows of a database into a map of `rowId -> property values`,
 * used by the relation and rollup columns.
 */
const loadRows = async (ctx: any, databaseId: Id<"documents">) => {
  const rows = await ctx.db
    .query("documents")
    .withIndex("by_parent", (q: any) => q.eq("parentDocument", databaseId))
    .filter((q: any) => q.eq(q.field("isArchived"), false))
    .collect();

  const withProps = await Promise.all(
    rows.map(async (row: any) => {
      const props = await ctx.db
        .query("pageProperties")
        .withIndex("by_document", (q: any) => q.eq("documentId", row._id))
        .collect();
      return { row, props };
    }),
  );

  return withProps;
};

/** Reads a property value of a row. */
const valueOf = (props: { key: string; value?: string }[], key: string) =>
  props.find((property) => property.key === key)?.value ?? "";

/** The databases of a workspace — used by the relation property picker. */
export const listDatabases = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, args) => {
    await getUserId(ctx);

    const userId = await getUserId(ctx);
    const databases = args.workspaceId
      ? await ctx.db
          .query("documents")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
          .filter((q) => q.eq(q.field("type"), "database"))
          .collect()
      : await ctx.db
          .query("documents")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .filter((q) => q.eq(q.field("type"), "database"))
          .collect();

    return databases.map((database) => ({
      _id: database._id,
      title: database.title,
      icon: database.icon,
    }));
  },
});

export const getDatabase = query({
  args: { databaseId: v.id("documents") },
  handler: async (ctx, args) => {
    const database = await ctx.db.get(args.databaseId);
    if (!database) throw new Error("Not found");

    if (database.workspaceId) {
      await requireMembership(ctx, database.workspaceId);
    }

    const properties = await ctx.db
      .query("databaseProperties")
      .withIndex("by_database", (q) => q.eq("databaseId", args.databaseId))
      .collect();

    const views = await ctx.db
      .query("views")
      .withIndex("by_database", (q) => q.eq("databaseId", args.databaseId))
      .collect();

    const rows = await ctx.db
      .query("documents")
      .withIndex("by_user_parent", (q) =>
        q.eq("userId", database.userId).eq("parentDocument", args.databaseId),
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();

    const propertiesByKey = new Map(properties.map((property) => [property.key, property]));

    // --------------------------------------------------
    //  Relations & rollups
    // --------------------------------------------------
    // A relation column stores the ids of the rows of another database, a
    // rollup column aggregates a property of those related rows.
    const relationColumns = properties.filter(
      (column) => column.type === "relation",
    );
    const rollupColumns = properties.filter((column) => column.type === "rollup");

    const relatedDatabases = new Map<
      string,
      Awaited<ReturnType<typeof loadRows>>
    >();

    for (const column of relationColumns) {
      const targetId = column.options?.[0] as Id<"documents"> | undefined;
      if (!targetId || relatedDatabases.has(targetId)) continue;
      relatedDatabases.set(targetId, await loadRows(ctx, targetId));
    }

    const aggregate = (values: string[], aggregation: string) => {
      if (aggregation === "count") return String(values.length);
      if (aggregation === "list") return values.filter(Boolean).join(", ");
      const numbers = values
        .map((value) => Number(value))
        .filter((value) => !Number.isNaN(value));
      if (numbers.length === 0) return "";
      if (aggregation === "sum") {
        return String(numbers.reduce((sum, value) => sum + value, 0));
      }
      if (aggregation === "avg") {
        return String(
          numbers.reduce((sum, value) => sum + value, 0) / numbers.length,
        );
      }
      if (aggregation === "min") return String(Math.min(...numbers));
      if (aggregation === "max") return String(Math.max(...numbers));
      return "";
    };

    const rowProperties = await Promise.all(
      rows.map(async (row) => {
        const props = await ctx.db
          .query("pageProperties")
          .withIndex("by_document", (q) => q.eq("documentId", row._id))
          .collect();

        // Formula properties are computed on the fly.
        const scope: Record<string, string | number | boolean | null> = {
          Name: row.title,
          Title: row.title,
        };
        for (const property of props) {
          scope[property.key] = property.value ?? "";
          const column = propertiesByKey.get(property.key);
          if (column) scope[column.name] = property.value ?? "";
        }

        const computed = properties
          .filter((column) => column.type === "formula")
          .map((column) => {
            const expression = column.options?.[0] ?? "";
            const result = evaluateFormula(expression, scope);
            return {
              key: column.key,
              type: "formula",
              value: result === null ? "" : String(result),
            };
          });

        // Relation columns: resolve the related rows.
        const relatedRows: Record<string, { title: string; props: any[] }[]> =
          {};
        for (const column of relationColumns) {
          const targetId = column.options?.[0];
          const targetRows = targetId ? relatedDatabases.get(targetId) : undefined;
          const ids = (valueOf(props, column.key) ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
          relatedRows[column.key] = (targetRows ?? [])
            .filter((entry: any) => ids.includes(entry.row._id))
            .map((entry: any) => ({
              title: entry.row.title,
              props: entry.props,
            }));
        }

        // Rollup columns: aggregate a property of the related rows.
        const rollups = rollupColumns.map((column) => {
          const [relationKey, targetKey, aggregation] = column.options ?? [];
          const entries = relationKey ? (relatedRows[relationKey] ?? []) : [];
          const values = entries.map((entry) => valueOf(entry.props, targetKey ?? ""));
          return {
            key: column.key,
            type: "rollup",
            value: aggregate(values, aggregation ?? "count"),
          };
        });

        return { row, props: [...props, ...computed, ...rollups] };
      }),
    );

    return {
      database,
      properties: properties.sort((a, b) => a.order - b.order),
      views: views.sort((a, b) => a.order - b.order),
      rows: rowProperties,
    };
  },
});

export const addProperty = mutation({
  args: {
    databaseId: v.id("documents"),
    name: v.string(),
    type: v.string(),
    options: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const database = await ctx.db.get(args.databaseId);
    if (!database) throw new Error("Not found");
    if (database.workspaceId) {
      await requireMembership(ctx, database.workspaceId);
    }

    const existing = await ctx.db
      .query("databaseProperties")
      .withIndex("by_database", (q) => q.eq("databaseId", args.databaseId))
      .collect();

    if (args.type === "formula") {
      const validation = validateFormula(args.options?.[0] ?? "");
      if (!validation.valid) {
        throw new Error(validation.error ?? "Invalid formula");
      }
    }

    const key = `${args.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    const id = await ctx.db.insert("databaseProperties", {
      databaseId: args.databaseId,
      key,
      name: args.name,
      type: args.type,
      options: args.options,
      order: existing.length,
    });

    await logActivity(ctx, {
      workspaceId: database.workspaceId,
      userId,
      action: "database.property_added",
      documentId: args.databaseId,
      metadata: { name: args.name, type: args.type },
    });

    return id;
  },
});

export const updateProperty = mutation({
  args: {
    propertyId: v.id("databaseProperties"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Not found");
    if (args.type === "formula" || property.type === "formula") {
      const validation = validateFormula(args.options?.[0] ?? "");
      if (!validation.valid) {
        throw new Error(validation.error ?? "Invalid formula");
      }
    }
    await ctx.db.patch(args.propertyId, {
      name: args.name,
      type: args.type,
      options: args.options,
    });
    return await ctx.db.get(args.propertyId);
  },
});

export const removeProperty = mutation({
  args: { propertyId: v.id("databaseProperties") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Not found");
    await ctx.db.delete(args.propertyId);
    return true;
  },
});

export const createRow = mutation({
  args: {
    databaseId: v.id("documents"),
    title: v.optional(v.string()),
    values: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const database = await ctx.db.get(args.databaseId);
    if (!database) throw new Error("Not found");
    if (database.workspaceId) {
      await requireMembership(ctx, database.workspaceId);
    }

    const timestamp = Date.now();
    const rowId = await ctx.db.insert("documents", {
      title: args.title ?? "Untitled",
      userId: database.userId,
      workspaceId: database.workspaceId,
      parentDocument: args.databaseId,
      type: "page",
      isArchived: false,
      isPublished: false,
      createdBy: userId,
      lastEditedBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastEditedAt: timestamp,
    });

    if (args.values) {
      for (const [key, value] of Object.entries(args.values)) {
        await ctx.db.insert("pageProperties", {
          documentId: rowId,
          key,
          type: "text",
          value,
          updatedAt: timestamp,
        });
      }
    }

    await logActivity(ctx, {
      workspaceId: database.workspaceId,
      userId,
      userName: identityName(identity),
      action: "database.row_created",
      documentId: args.databaseId,
      metadata: { rowId },
    });

    return rowId;
  },
});

export const setRowValue = mutation({
  args: {
    documentId: v.id("documents"),
    key: v.string(),
    type: v.string(),
    value: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const row = await ctx.db.get(args.documentId);
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
    } else {
      await ctx.db.insert("pageProperties", {
        documentId: args.documentId,
        key: args.key,
        type: args.type,
        value: args.value,
        options: args.options,
        updatedAt: Date.now(),
      });
    }

    // A change of a row can trigger the automations of the database.
    if (row?.parentDocument) {
      await runAutomations(
        ctx,
        row.parentDocument,
        args.documentId,
        args.key,
        args.value ?? "",
      );
    }

    return true;
  },
});

/**
 * Imports rows from a CSV file. The first column is used as the title of
 * the row, the remaining columns are matched against the existing columns
 * by name (unknown columns are created).
 */
export const importRows = mutation({
  args: {
    databaseId: v.id("documents"),
    rows: v.array(
      v.object({
        title: v.string(),
        values: v.record(v.string(), v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const database = await ctx.db.get(args.databaseId);
    if (!database) throw new Error("Not found");
    if (database.workspaceId) {
      const { membership } = await requireMembership(ctx, database.workspaceId);
      if (membership.role === "guest") {
        throw new Error("Guests cannot import rows");
      }
    }

    const columns = await ctx.db
      .query("databaseProperties")
      .withIndex("by_database", (q) => q.eq("databaseId", args.databaseId))
      .collect();

    const byName = new Map(columns.map((column) => [column.name, column]));
    const timestamp = Date.now();

    const created: Id<"documents">[] = [];

    for (const row of args.rows) {
      const rowId = await ctx.db.insert("documents", {
        title: row.title || "Untitled",
        userId: database.userId,
        workspaceId: database.workspaceId,
        parentDocument: args.databaseId,
        type: "page",
        isArchived: false,
        isPublished: false,
        createdBy: userId,
        lastEditedBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastEditedAt: timestamp,
      });

      for (const [name, value] of Object.entries(row.values)) {
        let column = byName.get(name);
        if (!column) {
          const id = await ctx.db.insert("databaseProperties", {
            databaseId: args.databaseId,
            key: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
            name,
            type: "text",
            options: [],
            order: columns.length,
          });
          const created = await ctx.db.get(id);
          if (created) {
            column = created;
            byName.set(name, created);
          }
        }
        if (!column) continue;
        await ctx.db.insert("pageProperties", {
          documentId: rowId,
          key: column.key,
          type: column.type,
          value,
          updatedAt: timestamp,
        });
      }

      created.push(rowId);
    }

    await logActivity(ctx, {
      workspaceId: database.workspaceId,
      userId,
      userName: identityName(identity),
      action: "database.rows_imported",
      documentId: args.databaseId,
      metadata: { count: created.length },
    });

    return created.length;
  },
});

export const deleteRow = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const row = await ctx.db.get(args.documentId);
    if (!row) throw new Error("Not found");
    await ctx.db.patch(args.documentId, { isArchived: true });
    return true;
  },
});

export const addView = mutation({
  args: {
    databaseId: v.id("documents"),
    name: v.string(),
    type: v.string(),
    groupBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const database = await ctx.db.get(args.databaseId);
    if (!database) throw new Error("Not found");
    if (database.workspaceId) {
      await requireMembership(ctx, database.workspaceId);
    }

    const views = await ctx.db
      .query("views")
      .withIndex("by_database", (q) => q.eq("databaseId", args.databaseId))
      .collect();

    return await ctx.db.insert("views", {
      databaseId: args.databaseId,
      name: args.name,
      type: args.type,
      groupBy: args.groupBy,
      order: views.length,
    });
  },
});

export const updateView = mutation({
  args: {
    viewId: v.id("views"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    groupBy: v.optional(v.string()),
    filters: v.optional(v.any()),
    sorts: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const view = await ctx.db.get(args.viewId);
    if (!view) throw new Error("Not found");
    await ctx.db.patch(args.viewId, {
      name: args.name,
      type: args.type,
      groupBy: args.groupBy,
      filters: args.filters,
      sorts: args.sorts,
    });
    return await ctx.db.get(args.viewId);
  },
});

export const removeView = mutation({
  args: { viewId: v.id("views") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const view = await ctx.db.get(args.viewId);
    if (!view) throw new Error("Not found");
    const views = await ctx.db
      .query("views")
      .withIndex("by_database", (q) => q.eq("databaseId", view.databaseId))
      .collect();
    if (views.length <= 1) {
      throw new Error("A database needs at least one view");
    }
    await ctx.db.delete(args.viewId);
    return true;
  },
});

export const reorderViews = mutation({
  args: { viewId: v.id("views"), direction: v.string() },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const view = await ctx.db.get(args.viewId);
    if (!view) throw new Error("Not found");
    const views = await ctx.db
      .query("views")
      .withIndex("by_database", (q) => q.eq("databaseId", view.databaseId))
      .collect();
    const sorted = views.sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((v) => v._id === args.viewId);
    const target = args.direction === "left" ? index - 1 : index + 1;
    if (target < 0 || target >= sorted.length) return true;
    const a = sorted[index];
    const b = sorted[target];
    await ctx.db.patch(a._id, { order: b.order });
    await ctx.db.patch(b._id, { order: a.order });
    return true;
  },
});

/* ------------------------------------------------------------------ */
/*  Automations                                                        */
/* ------------------------------------------------------------------ */

export const listAutomations = query({
  args: { databaseId: v.id("documents") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    return await ctx.db
      .query("automations")
      .withIndex("by_database", (q) => q.eq("databaseId", args.databaseId))
      .collect();
  },
});

export const createAutomation = mutation({
  args: {
    databaseId: v.id("documents"),
    name: v.string(),
    triggerKey: v.string(),
    triggerValue: v.string(),
    actions: v.array(
      v.object({
        type: v.string(),
        key: v.optional(v.string()),
        value: v.optional(v.string()),
        body: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const database = await ctx.db.get(args.databaseId);
    if (!database) throw new Error("Not found");
    if (database.workspaceId) {
      await requireMembership(ctx, database.workspaceId);
    }

    // The number of automations is limited by the plan.
    if (database.workspaceId) {
      const workspace = await ctx.db.get(database.workspaceId);
      const plan = getPlan(workspace?.plan ?? "free");
      if (plan.limits.automations !== Number.POSITIVE_INFINITY) {
        const existing = await ctx.db
          .query("automations")
          .withIndex("by_database", (q) => q.eq("databaseId", args.databaseId))
          .collect();
        if (existing.length + 1 > plan.limits.automations) {
          throw new Error(
            plan.limits.automations === 0
              ? `Automations are not included in the ${plan.name} plan. Upgrade to automate your databases.`
              : `Your ${plan.name} plan allows ${plan.limits.automations} automations per database. Upgrade for more.`,
          );
        }
      }
    }

    const id = await ctx.db.insert("automations", {
      workspaceId: database.workspaceId,
      databaseId: args.databaseId,
      name: args.name,
      triggerKey: args.triggerKey,
      triggerValue: args.triggerValue,
      actions: args.actions,
      enabled: true,
      createdAt: Date.now(),
    });

    await logActivity(ctx, {
      workspaceId: database.workspaceId,
      userId,
      userName: identityName(identity),
      action: "database.automation_created",
      documentId: args.databaseId,
      metadata: { name: args.name },
    });

    return id;
  },
});

export const updateAutomation = mutation({
  args: {
    automationId: v.id("automations"),
    name: v.optional(v.string()),
    triggerKey: v.optional(v.string()),
    triggerValue: v.optional(v.string()),
    actions: v.optional(
      v.array(
        v.object({
          type: v.string(),
          key: v.optional(v.string()),
          value: v.optional(v.string()),
          body: v.optional(v.string()),
        }),
      ),
    ),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const automation = await ctx.db.get(args.automationId);
    if (!automation) throw new Error("Not found");
    await ctx.db.patch(args.automationId, {
      name: args.name,
      triggerKey: args.triggerKey,
      triggerValue: args.triggerValue,
      actions: args.actions,
      enabled: args.enabled,
    });
    return await ctx.db.get(args.automationId);
  },
});

export const removeAutomation = mutation({
  args: { automationId: v.id("automations") },
  handler: async (ctx, args) => {
    await getUserId(ctx);
    const automation = await ctx.db.get(args.automationId);
    if (!automation) throw new Error("Not found");
    await ctx.db.delete(args.automationId);
    return true;
  },
});

/**
 * Runs the automations of a database when a property of one of its rows
 * reaches the trigger value.
 */
export const runAutomations = async (
  ctx: any,
  databaseId: Id<"documents">,
  rowId: Id<"documents">,
  changedKey: string,
  newValue: string,
) => {
  const automations = await ctx.db
    .query("automations")
    .withIndex("by_database", (q: any) => q.eq("databaseId", databaseId))
    .collect();

  for (const automation of automations) {
    if (automation.enabled === false) continue;
    if (automation.triggerKey !== changedKey) continue;
    if (automation.triggerValue !== newValue) continue;

    for (const action of automation.actions) {
      if (action.type === "setProperty" && action.key) {
        const existing = await ctx.db
          .query("pageProperties")
          .withIndex("by_document", (q: any) => q.eq("documentId", rowId))
          .filter((q: any) => q.eq(q.field("key"), action.key))
          .first();
        if (existing) {
          await ctx.db.patch(existing._id, {
            value: action.value ?? "",
            updatedAt: Date.now(),
          });
        } else {
          await ctx.db.insert("pageProperties", {
            documentId: rowId,
            key: action.key,
            type: "text",
            value: action.value ?? "",
            updatedAt: Date.now(),
          });
        }
      }

      if (action.type === "notify") {
        const database = await ctx.db.get(databaseId);
        const members = database?.workspaceId
          ? await ctx.db
              .query("workspaceMembers")
              .withIndex("by_workspace", (q: any) =>
                q.eq("workspaceId", database.workspaceId),
              )
              .collect()
          : [];
        for (const member of members) {
          await ctx.db.insert("notifications", {
            userId: member.userId,
            workspaceId: database?.workspaceId,
            documentId: rowId,
            actorName: "Jotion automation",
            type: "automation",
            body:
              action.body ??
              `“${automation.name}” was triggered by a change to ${changedKey}.`,
            read: false,
            createdAt: Date.now(),
          });
        }
      }
    }

    await logActivity(ctx, {
      workspaceId: automations[0]?.workspaceId,
      userId: "system",
      action: "database.automation_triggered",
      documentId: rowId,
      metadata: { name: automation.name },
    });
  }
};

export const createDatabase = mutation({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    parentDocument: v.optional(v.id("documents")),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    const timestamp = Date.now();

    if (args.workspaceId) {
      await requireMembership(ctx, args.workspaceId);
      const workspace = await ctx.db.get(args.workspaceId);
      if (workspace) {
        const plan = getPlan(workspace.plan);
        if (plan.limits.databases !== Number.POSITIVE_INFINITY) {
          const databases = await ctx.db
            .query("documents")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
            .filter((q) => q.eq(q.field("type"), "database"))
            .collect();
          if (databases.length + 1 > plan.limits.databases) {
            throw new Error(
              `Your ${plan.name} plan supports up to ${plan.limits.databases} databases. Upgrade for unlimited databases.`,
            );
          }
        }
      }
    }

    const databaseId = await ctx.db.insert("documents", {
      title: args.name ?? "New database",
      userId,
      workspaceId: args.workspaceId,
      parentDocument: args.parentDocument,
      type: "database",
      icon: args.icon ?? "🗃️",
      isArchived: false,
      isPublished: false,
      createdBy: userId,
      lastEditedBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastEditedAt: timestamp,
    });

    const defaultColumns = [
      { name: "Status", type: "select", options: ["Not started", "In progress", "Done"] },
      { name: "Tags", type: "multi_select", options: [] },
      { name: "Owner", type: "person", options: [] },
      { name: "Due", type: "date", options: [] },
    ];

    let order = 0;
    for (const column of defaultColumns) {
      await ctx.db.insert("databaseProperties", {
        databaseId,
        key: `${column.name.toLowerCase()}-${order}`,
        name: column.name,
        type: column.type,
        options: column.options,
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

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      userName: identityName(identity),
      action: "database.created",
      documentId: databaseId,
      metadata: { name: args.name ?? "New database" },
    });

    return databaseId;
  },
});
