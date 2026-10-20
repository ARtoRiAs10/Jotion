import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "@/convex/schema";
import * as documents from "@/convex/documents";
import * as workspaces from "@/convex/workspaces";
import { markdownToBlocks, titleFromMarkdown, blocksToMarkdown } from "@/lib/markdown";

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

describe("markdown import", () => {
  it("converts Markdown into blocks", () => {
    const blocks = markdownToBlocks(
      [
        "# Title",
        "",
        "A **bold** paragraph.",
        "",
        "- one",
        "- [x] done",
        "",
        "1. first",
        "",
        "> quote",
        "",
        "```js",
        "const a = 1;",
        "```",
        "",
        "---",
      ].join("\n"),
    );

    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "bulletListItem",
      "toDoItem",
      "numberedListItem",
      "quote",
      "codeBlock",
      "divider",
    ]);
    expect(blocks[0].attrs?.level).toBe(1);
    expect(blocks[1].content?.[1].styles?.bold).toBe(true);
    expect(blocks[3].attrs?.checked).toBe(true);
    expect(titleFromMarkdown("# Hello\n\nWorld")).toBe("Hello");
  });

  it("round-trips through the Markdown exporter", () => {
    const blocks = markdownToBlocks("# Title\n\n- one\n- two");
    const markdown = blocksToMarkdown(blocks);
    expect(markdown).toContain("# Title");
    expect(markdown).toContain("- one");
  });

  it("imports a Markdown document as a page", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const documentId = await mutation(owner, documents.importMarkdown, {
      workspaceId,
      markdown: "# Imported\n\nHello **world**",
    });

    const page = await query(owner, documents.getById, { documentId });
    expect(page.title).toBe("Imported");
    expect(page.icon).toBe("📥");
    const blocks = JSON.parse(page.content ?? "[]");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("heading");
  });

  it("uses the given title over the first heading", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const documentId = await mutation(owner, documents.importMarkdown, {
      workspaceId,
      title: "Custom title",
      markdown: "# Something else",
    });

    const page = await query(owner, documents.getById, { documentId });
    expect(page.title).toBe("Custom title");
  });
});

describe("conflicting edits", () => {
  it("refuses to overwrite a page that was changed in the meantime", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const documentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Page",
    });
    const loaded = await query(owner, documents.getById, { documentId });

    // Somebody else saves first.
    await owner.run(async (ctx: any) => {
      await ctx.db.patch(documentId, {
        content: JSON.stringify([{ type: "paragraph", content: [] }]),
        updatedAt: Date.now() + 1000,
      });
    });

    await expect(
      mutation(owner, documents.update, {
        id: documentId,
        content: JSON.stringify([{ type: "paragraph", content: [] }]),
        baseUpdatedAt: loaded.updatedAt,
      }),
    ).rejects.toThrow(/edited by somebody else/i);
  });

  it("allows the edit when nothing changed in the meantime", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const documentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Page",
    });
    const loaded = await query(owner, documents.getById, { documentId });

    await mutation(owner, documents.update, {
      id: documentId,
      content: JSON.stringify([{ type: "paragraph", content: [] }]),
      baseUpdatedAt: loaded.updatedAt,
    });

    const page = await query(owner, documents.getById, { documentId });
    expect(page.content).toContain("paragraph");
  });
});

describe("linked mentions", () => {
  it("lists the pages that mention a page", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const target = await mutation(owner, documents.create, {
      workspaceId,
      title: "Roadmap",
    });
    const source = await mutation(owner, documents.create, {
      workspaceId,
      title: "Weekly review",
    });

    await mutation(owner, documents.setProperty, {
      documentId: source,
      key: "link",
      type: "mention",
      value: target,
    });

    const backlinks = await query(owner, documents.getBacklinks, {
      documentId: target,
    });
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0]._id).toBe(source);
    expect(backlinks[0].title).toBe("Weekly review");

    // The other way round there is nothing.
    const other = await query(owner, documents.getBacklinks, {
      documentId: source,
    });
    expect(other).toHaveLength(0);
  });

  it("offers the pages of the workspace for the mention picker", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    await mutation(owner, documents.create, { workspaceId, title: "One" });
    await mutation(owner, documents.create, { workspaceId, title: "Two" });

    const pages = await query(owner, documents.getMentionablePages, {
      workspaceId,
    });
    expect(pages).toHaveLength(2);
    expect(pages.map((page: any) => page.title).sort()).toEqual(["One", "Two"]);
  });
});
