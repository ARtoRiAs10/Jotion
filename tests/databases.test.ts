import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "@/convex/schema";
import * as databases from "@/convex/databases";
import * as documents from "@/convex/documents";
import * as workspaces from "@/convex/workspaces";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mutation = (t: any, fn: any, args: any) => t.mutation(fn, args);
const query = (t: any, fn: any, args: any) => t.query(fn, args);

const seed = async (t: any) => {
  const owner = t.withIdentity({ subject: "user_owner", name: "Owner" });
  const workspaceId = await owner.run(async (ctx: any) => {
    const id = await ctx.db.insert("workspaces", {
      name: "Acme",
      slug: "acme",
      plan: "business",
      billingCycle: "monthly",
      ownerId: "user_owner",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      subscriptionStatus: "active",
    });
    await ctx.db.insert("workspaceMembers", {
      workspaceId: id,
      userId: "user_owner",
      email: "owner@acme.test",
      role: "owner",
      createdAt: Date.now(),
    });
    return id;
  });
  return { owner, workspaceId };
};

describe("databases", () => {
  it("creates a database with default columns and a table view", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const databaseId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Tasks",
    });

    const data = await query(owner, databases.getDatabase, { databaseId });
    expect(data.database.title).toBe("Tasks");
    expect(data.properties.map((p: any) => p.name)).toEqual([
      "Status",
      "Tags",
      "Owner",
      "Due",
    ]);
    expect(data.views).toHaveLength(1);
    expect(data.views[0].type).toBe("table");
  });

  it("computes formula properties on read", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const databaseId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Invoices",
    });

    // Replace the default columns with two plain ones.
    for (const property of (await query(owner, databases.getDatabase, { databaseId }))
      .properties) {
      await mutation(owner, databases.removeProperty, {
        propertyId: property._id,
      });
    }

    await mutation(owner, databases.addProperty, {
      databaseId,
      name: "Price",
      type: "number",
    });
    await mutation(owner, databases.addProperty, {
      databaseId,
      name: "Quantity",
      type: "number",
    });
    await mutation(owner, databases.addProperty, {
      databaseId,
      name: "Total",
      type: "formula",
      options: ['prop("Price") * prop("Quantity")'],
    });

    const data = await query(owner, databases.getDatabase, { databaseId });
    const priceKey = data.properties.find((p: any) => p.name === "Price").key;
    const quantityKey = data.properties.find((p: any) => p.name === "Quantity").key;

    const rowId = await mutation(owner, databases.createRow, {
      databaseId,
      title: "Design",
    });
    await mutation(owner, databases.setRowValue, {
      documentId: rowId,
      key: priceKey,
      type: "number",
      value: "120",
    });
    await mutation(owner, databases.setRowValue, {
      documentId: rowId,
      key: quantityKey,
      type: "number",
      value: "3",
    });

    const refreshed = await query(owner, databases.getDatabase, { databaseId });
    const row = refreshed.rows.find((entry: any) => entry.row._id === rowId);
    const total = row.props.find((prop: any) => prop.key.includes("total"));

    expect(total?.type).toBe("formula");
    expect(total?.value).toBe("360");
  });

  it("rejects a broken formula", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);
    const databaseId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Broken",
    });

    await expect(
      mutation(owner, databases.addProperty, {
        databaseId,
        name: "Bad",
        type: "formula",
        options: ["prop("],
      }),
    ).rejects.toThrow();
  });

  it("imports rows from CSV data and creates unknown columns", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);
    const databaseId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Imported",
    });

    const count = await mutation(owner, databases.importRows, {
      databaseId,
      rows: [
        { title: "Website", values: { Status: "In progress", Budget: "1200" } },
        { title: "Mobile app", values: { Status: "Not started", Budget: "3400" } },
      ],
    });
    expect(count).toBe(2);

    const data = await query(owner, databases.getDatabase, { databaseId });
    expect(data.rows).toHaveLength(2);
    expect(data.properties.map((p: any) => p.name)).toContain("Budget");

    const website = data.rows.find((entry: any) => entry.row.title === "Website");
    const status = website.props.find((prop: any) => prop.value === "In progress");
    expect(status).toBeTruthy();
  });

  it("keeps the rows of a database when the page is archived", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);
    const databaseId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Tasks",
    });
    const rowId = await mutation(owner, databases.createRow, {
      databaseId,
      title: "Row",
    });

    await mutation(owner, databases.deleteRow, { documentId: rowId });

    const data = await query(owner, databases.getDatabase, { databaseId });
    expect(data.rows).toHaveLength(0);
  });
});

describe("documents", () => {
  it("creates sub-pages and finds them through the parent index", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const parentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Parent",
    });
    const childId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Child",
      parentDocument: parentId,
    });

    const children = await query(owner, documents.getChildren, {
      documentId: parentId,
    });
    expect(children).toHaveLength(1);
    expect(children[0]._id).toBe(childId);
  });

  it("archives a page together with its children", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const parentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Parent",
    });
    await mutation(owner, documents.create, {
      workspaceId,
      title: "Child",
      parentDocument: parentId,
    });

    await mutation(owner, documents.archive, { id: parentId });

    const children = await query(owner, documents.getChildren, {
      documentId: parentId,
    });
    expect(children).toHaveLength(0);
  });

  it("duplicates a page together with its children", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const parentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Parent",
    });
    await mutation(owner, documents.create, {
      workspaceId,
      title: "Child",
      parentDocument: parentId,
    });

    const copyId = await mutation(owner, documents.duplicate, { id: parentId });
    const copyChildren = await query(owner, documents.getChildren, {
      documentId: copyId,
    });
    expect(copyChildren).toHaveLength(1);
    expect(copyChildren[0].title).toBe("Child");
  });

  it("keeps a version snapshot on every content change", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);
    const documentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Page",
    });

    await mutation(owner, documents.update, {
      id: documentId,
      content: JSON.stringify([{ type: "paragraph", content: [] }]),
    });

    const versions = await owner.run(async (ctx: any) => {
      return await ctx.db
        .query("versions")
        .withIndex("by_document", (q: any) => q.eq("documentId", documentId))
        .collect();
    });
    expect(versions.length).toBeGreaterThan(0);
  });
});
