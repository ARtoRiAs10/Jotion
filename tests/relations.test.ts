import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "@/convex/schema";
import * as databases from "@/convex/databases";
import * as workspaces from "@/convex/workspaces";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mutation = (t: any, fn: any, args: any) => t.mutation(fn, args);
const query = (t: any, fn: any, args: any) => t.query(fn, args);

const seed = async (t: any, plan = "business") => {
  const owner = t.withIdentity({ subject: "user_owner", name: "Owner" });
  const workspaceId = await owner.run(async (ctx: any) => {
    const id = await ctx.db.insert("workspaces", {
      name: "Acme",
      slug: "acme",
      plan,
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

/** Creates a database with a single "Amount" number column. */
const createTargetDatabase = async (t: any, owner: any, workspaceId: any) => {
  const databaseId = await mutation(owner, databases.createDatabase, {
    workspaceId,
    name: "Invoices",
  });

  for (const property of (
    await query(owner, databases.getDatabase, { databaseId })
  ).properties) {
    await mutation(owner, databases.removeProperty, {
      propertyId: property._id,
    });
  }

  const amountId = await mutation(owner, databases.addProperty, {
    databaseId,
    name: "Amount",
    type: "number",
  });
  const data = await query(owner, databases.getDatabase, { databaseId });
  const amountKey = data.properties.find((p: any) => p.name === "Amount").key;

  const rows: string[] = [];
  for (const amount of ["100", "250"]) {
    const rowId = await mutation(owner, databases.createRow, {
      databaseId,
      title: `Invoice ${amount}`,
    });
    await mutation(owner, databases.setRowValue, {
      documentId: rowId,
      key: amountKey,
      type: "number",
      value: amount,
    });
    rows.push(rowId);
  }

  return { databaseId, amountKey, rows };
};

describe("relations & rollups", () => {
  it("links rows of two databases and rolls the values up", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const target = await createTargetDatabase(t, owner, workspaceId);

    // A database that relates to the invoices.
    const projectsId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Projects",
    });
    for (const property of (
      await query(owner, databases.getDatabase, { databaseId: projectsId })
    ).properties) {
      await mutation(owner, databases.removeProperty, {
        propertyId: property._id,
      });
    }

    await mutation(owner, databases.addProperty, {
      databaseId: projectsId,
      name: "Invoices",
      type: "relation",
      options: [target.databaseId],
    });

    // The relation key is generated, so it has to be read before the rollup
    // can point at it.
    const data = await query(owner, databases.getDatabase, {
      databaseId: projectsId,
    });
    const relationKey = data.properties.find(
      (p: any) => p.name === "Invoices",
    ).key;

    await mutation(owner, databases.addProperty, {
      databaseId: projectsId,
      name: "Total billed",
      type: "rollup",
      options: [relationKey, target.amountKey, "sum"],
    });

    const rowId = await mutation(owner, databases.createRow, {
      databaseId: projectsId,
      title: "Website",
    });
    await mutation(owner, databases.setRowValue, {
      documentId: rowId,
      key: relationKey,
      type: "relation",
      value: target.rows.join(","),
    });

    const refreshed = await query(owner, databases.getDatabase, {
      databaseId: projectsId,
    });
    const row = refreshed.rows.find((entry: any) => entry.row._id === rowId);

    const rollup = row.props.find((prop: any) => prop.type === "rollup");
    expect(rollup?.value).toBe("350"); // 100 + 250
  });

  it("rolls up a count and a maximum", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const target = await createTargetDatabase(t, owner, workspaceId);
    const projectsId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Projects",
    });
    for (const property of (
      await query(owner, databases.getDatabase, { databaseId: projectsId })
    ).properties) {
      await mutation(owner, databases.removeProperty, {
        propertyId: property._id,
      });
    }

    await mutation(owner, databases.addProperty, {
      databaseId: projectsId,
      name: "Invoices",
      type: "relation",
      options: [target.databaseId],
    });

    const data = await query(owner, databases.getDatabase, {
      databaseId: projectsId,
    });
    const relationKey = data.properties.find(
      (p: any) => p.name === "Invoices",
    ).key;

    await mutation(owner, databases.addProperty, {
      databaseId: projectsId,
      name: "How many",
      type: "rollup",
      options: [relationKey, target.amountKey, "count"],
    });
    await mutation(owner, databases.addProperty, {
      databaseId: projectsId,
      name: "Largest",
      type: "rollup",
      options: [relationKey, target.amountKey, "max"],
    });

    const rowId = await mutation(owner, databases.createRow, {
      databaseId: projectsId,
      title: "Website",
    });
    await mutation(owner, databases.setRowValue, {
      documentId: rowId,
      key: relationKey,
      type: "relation",
      value: target.rows.join(","),
    });

    const refreshed = await query(owner, databases.getDatabase, {
      databaseId: projectsId,
    });
    const row = refreshed.rows.find((entry: any) => entry.row._id === rowId);
    const count = row.props.find((prop: any) => prop.value === "2");
    const max = row.props.find((prop: any) => prop.value === "250");
    expect(count).toBeTruthy();
    expect(max).toBeTruthy();
  });
});

describe("automations", () => {
  it("runs an action when a property reaches the trigger value", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const databaseId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Tasks",
    });
    const data = await query(owner, databases.getDatabase, { databaseId });
    const statusKey = data.properties.find((p: any) => p.name === "Status").key;
    const ownerKey = data.properties.find((p: any) => p.name === "Owner").key;

    await mutation(owner, databases.createAutomation, {
      databaseId,
      name: "Assign the owner",
      triggerKey: statusKey,
      triggerValue: "Done",
      actions: [{ type: "setProperty", key: ownerKey, value: "Ada" }],
    });

    const rowId = await mutation(owner, databases.createRow, {
      databaseId,
      title: "Task",
    });

    // Not the trigger value yet.
    await mutation(owner, databases.setRowValue, {
      documentId: rowId,
      key: statusKey,
      type: "select",
      value: "In progress",
    });
    let row = await query(owner, databases.getDatabase, { databaseId });
    expect(
      row.rows[0].props.find((prop: any) => prop.key === ownerKey)?.value,
    ).toBeUndefined();

    // Now the trigger fires.
    await mutation(owner, databases.setRowValue, {
      documentId: rowId,
      key: statusKey,
      type: "select",
      value: "Done",
    });
    row = await query(owner, databases.getDatabase, { databaseId });
    expect(
      row.rows[0].props.find((prop: any) => prop.key === ownerKey)?.value,
    ).toBe("Ada");
  });

  it("notifies the team", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const databaseId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Tasks",
    });
    const data = await query(owner, databases.getDatabase, { databaseId });
    const statusKey = data.properties.find((p: any) => p.name === "Status").key;

    await mutation(owner, databases.createAutomation, {
      databaseId,
      name: "Celebrate",
      triggerKey: statusKey,
      triggerValue: "Done",
      actions: [{ type: "notify", body: "A task was completed" }],
    });

    const rowId = await mutation(owner, databases.createRow, {
      databaseId,
      title: "Task",
    });
    await mutation(owner, databases.setRowValue, {
      documentId: rowId,
      key: statusKey,
      type: "select",
      value: "Done",
    });

    const notifications = await owner.run(async (ctx: any) => {
      return await ctx.db.query("notifications").collect();
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("automation");
  });

  it("is not available on the free plan", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t, "free");

    const databaseId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Tasks",
    });

    await expect(
      mutation(owner, databases.createAutomation, {
        databaseId,
        name: "Not allowed",
        triggerKey: "status-0",
        triggerValue: "Done",
        actions: [{ type: "notify" }],
      }),
    ).rejects.toThrow(/not included in the Free plan/i);
  });
});
