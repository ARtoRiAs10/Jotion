import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "@/convex/schema";
import * as documents from "@/convex/documents";
import * as workspaces from "@/convex/workspaces";
import { buildImportTree, parseCsv, parseCsvLine } from "@/lib/notion-import";
import { readZip } from "@/lib/zip";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mutation = (t: any, fn: any, args: any) => t.mutation(fn, args);
const query = (t: any, fn: any, args: any) => t.query(fn, args);

/**
 * Builds an uncompressed (stored) ZIP archive in memory — enough to test the
 * reader without a compression library.
 */
const buildZip = (files: { path: string; content: string }[]) => {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = encoder.encode(file.content);
    const crc = 0; // the reader does not verify the CRC

    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true); // stored
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);

    const entry = new Uint8Array(46 + name.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint16(10, 0, true); // stored
    entryView.setUint32(16, crc, true);
    entryView.setUint32(20, data.length, true);
    entryView.setUint32(24, data.length, true);
    entryView.setUint16(28, name.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(name, 46);

    parts.push(local);
    central.push(entry);
    offset += local.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  const total = new Uint8Array(
    offset + centralSize + end.length,
  );
  let position = 0;
  for (const part of [...parts, ...central, end]) {
    total.set(part, position);
    position += part.length;
  }
  return total;
};

describe("zip reader", () => {
  it("reads the files of an archive", async () => {
    const archive = buildZip([
      { path: "Export-1/My workspace/Page.md", content: "# Page" },
      { path: "Export-1/My workspace/Page/Child.md", content: "# Child" },
    ]);

    const entries = await readZip(new Blob([archive as BlobPart]));
    expect(entries).toHaveLength(2);

    const page = entries.find((entry) => entry.path.endsWith("Page.md"))!;
    expect(page.name).toBe("Page.md");
    expect(new TextDecoder().decode(await page.read())).toBe("# Page");
  });
});

describe("CSV parsing", () => {
  it("parses quoted cells", () => {
    expect(parseCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(parseCsvLine('a,"say ""hi""",d')).toEqual(["a", 'say "hi"', "d"]);
  });

  it("parses a whole document", () => {
    const rows = parseCsv("Name,Status\nTask 1,Done\nTask 2,Doing");
    expect(rows).toEqual([
      ["Name", "Status"],
      ["Task 1", "Done"],
      ["Task 2", "Doing"],
    ]);
  });
});

describe("notion export import", () => {
  it("builds the page and database tree of an export", async () => {
    const archive = buildZip([
      { path: "Export-1/Acme/Getting started.md", content: "# Getting started" },
      {
        path: "Export-1/Acme/Getting started/Sub page.md",
        content: "# Sub page",
      },
      {
        path: "Export-1/Acme/Projects/Projects.csv",
        content: "Name,Status\nTask 1,Done",
      },
    ]);

    const entries = await readZip(new Blob([archive as BlobPart]));
    const tree = await buildImportTree(
      entries.map((entry) => ({
        path: entry.path,
        name: entry.name,
        read: entry.read,
      })),
    );

    expect(tree.pages).toHaveLength(1);
    expect(tree.pages[0].title).toBe("Getting started");
    expect(tree.pages[0].children?.[0].title).toBe("Sub page");
    expect(tree.databases).toHaveLength(1);
    expect(tree.databases[0].title).toBe("Projects");
    expect(tree.databases[0].columns).toEqual(["Name", "Status"]);
    expect(tree.databases[0].rows).toEqual([["Task 1", "Done"]]);
  });

  it("imports the pages and databases into the workspace", async () => {
    const t = convexTest(schema);
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

    const result = await mutation(owner, documents.importNotionExport, {
      workspaceId,
      pages: [
        {
          title: "Getting started",
          content: "# Getting started\n\nWelcome",
          children: [{ title: "Sub page", content: "# Sub", children: [] }],
        },
      ],
      databases: [
        {
          title: "Projects",
          columns: ["Name", "Status"],
          rows: [["Task 1", "Done"]],
          children: [],
        },
      ],
    });

    expect(result.pages).toBe(2);
    expect(result.databases).toBe(1);

    const documentsInWorkspace = await owner.run(async (ctx: any) => {
      return await ctx.db
        .query("documents")
        .withIndex("by_workspace", (q: any) => q.eq("workspaceId", workspaceId))
        .collect();
    });

    const titles = documentsInWorkspace.map((doc: any) => doc.title).sort();
    expect(titles).toEqual([
      "Getting started",
      "Projects",
      "Sub page",
      "Task 1",
    ]);

    // The Markdown of the page became blocks.
    const page = documentsInWorkspace.find(
      (doc: any) => doc.title === "Getting started",
    );
    const blocks = JSON.parse(page.content ?? "[]");
    expect(blocks[0].type).toBe("heading");

    // The CSV row became a page with the values as properties.
    const row = documentsInWorkspace.find(
      (doc: any) => doc.title === "Task 1",
    );
    const properties = await owner.run(async (ctx: any) => {
      return await ctx.db
        .query("pageProperties")
        .withIndex("by_document", (q: any) => q.eq("documentId", row._id))
        .collect();
    });
    expect(properties.map((p: any) => p.value)).toContain("Done");
  });
});
