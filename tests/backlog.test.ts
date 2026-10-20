import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "@/convex/schema";
import * as databases from "@/convex/databases";
import * as documents from "@/convex/documents";
import * as templates from "@/convex/templates";
import * as workspaces from "@/convex/workspaces";
import { buildPrompt } from "@/lib/ai";

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

describe("templates", () => {
  it("creates a page with the properties of the template", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const templateId = await owner.run(async (ctx: any) => {
      return await ctx.db.insert("templates", {
        workspaceId,
        name: "Weekly review",
        icon: "📝",
        type: "page",
        content: JSON.stringify([{ type: "paragraph", content: [] }]),
        properties: [
          { key: "status", name: "Status", type: "select", value: "In progress" },
        ],
        isDefault: false,
        createdAt: Date.now(),
      });
    });

    const documentId = await mutation(owner, templates.createFromTemplate, {
      templateId,
      workspaceId,
    });

    const page = await query(owner, documents.getById, { documentId });
    expect(page.title).toBe("Weekly review");
    expect(page.icon).toBe("📝");

    const properties = await query(owner, documents.getProperties, {
      documentId,
    });
    expect(properties[0].value).toBe("In progress");
  });

  it("creates a database with the columns and views of the template", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const templateId = await owner.run(async (ctx: any) => {
      return await ctx.db.insert("templates", {
        workspaceId,
        name: "Project tracker",
        icon: "🚀",
        type: "database",
        columns: [
          { name: "Status", type: "select", options: ["Done"] },
          { name: "Owner", type: "person" },
        ],
        views: [
          { name: "All", type: "table" },
          { name: "Board", type: "board" },
        ],
        isDefault: false,
        createdAt: Date.now(),
      });
    });

    const databaseId = await mutation(owner, templates.createFromTemplate, {
      templateId,
      workspaceId,
    });

    const data = await query(owner, databases.getDatabase, { databaseId });
    expect(data.properties.map((p: any) => p.name)).toEqual([
      "Status",
      "Owner",
    ]);
    expect(data.views).toHaveLength(2);
  });

  it("saves a page as a template", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const documentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Weekly review",
    });
    await mutation(owner, documents.setProperty, {
      documentId,
      key: "status",
      type: "select",
      value: "Done",
    });

    const templateId = await mutation(owner, templates.saveAsTemplate, {
      documentId,
      workspaceId,
    });

    const template = await owner.run(async (ctx: any) => {
      return await ctx.db.get(templateId);
    });
    expect(template.name).toBe("Weekly review");
    expect(template.properties?.[0].value).toBe("Done");
  });
});

describe("synced pages", () => {
  it("mirrors the content of the source page", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const sourceId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Handbook",
    });
    await mutation(owner, documents.update, {
      id: sourceId,
      content: JSON.stringify([{ type: "paragraph", content: [] }]),
    });

    const copyId = await mutation(owner, documents.createSyncedCopy, {
      documentId: sourceId,
      workspaceId,
    });

    const copy = await query(owner, documents.getById, { documentId: copyId });
    expect(copy.syncedFrom).toBe(sourceId);

    const source = await query(owner, documents.getSyncedSource, {
      documentId: copyId,
    });
    expect(source?._id).toBe(sourceId);
    expect(source?.content).toContain("paragraph");

    // The content of a synced page cannot be edited directly.
    await expect(
      mutation(owner, documents.update, {
        id: copyId,
        content: JSON.stringify([]),
      }),
    ).rejects.toThrow(/mirrors the content/i);
  });
});

describe("ai prompts", () => {
  it("builds a prompt for every task", () => {
    expect(buildPrompt({ task: "improve", text: "Hello" })).toContain(
      "Rewrite the following text",
    );
    expect(buildPrompt({ task: "summarize", text: "Hello" })).toContain(
      "Summarize",
    );
    expect(
      buildPrompt({ task: "translate", text: "Hello", language: "German" }),
    ).toContain("German");
  });
});
