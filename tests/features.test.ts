import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "@/convex/schema";
import * as activity from "@/convex/activity";
import * as demo from "@/convex/demo";
import * as documents from "@/convex/documents";
import * as workspaces from "@/convex/workspaces";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mutation = (t: any, fn: any, args: any) => t.mutation(fn, args);
const query = (t: any, fn: any, args: any) => t.query(fn, args);

const seed = async (t: any, plan = "free") => {
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

describe("private pages", () => {
  it("is not available on the free plan", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t, "free");

    await expect(
      mutation(owner, documents.create, {
        workspaceId,
        title: "Secret",
        isPrivate: true,
      }),
    ).rejects.toThrow(/not included in the Free plan/i);
  });

  it("is available on paid plans and hidden from other members", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t, "business");

    const member = t.withIdentity({
      subject: "user_member",
      name: "Member",
      email: "member@acme.test",
    });
    await mutation(owner, workspaces.inviteMember, {
      workspaceId,
      email: "member@acme.test",
      role: "member",
    });
    await mutation(member, workspaces.ensureDefault, {});

    const documentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Secret",
      isPrivate: true,
    });

    // The creator can open it …
    const own = await query(owner, documents.getById, { documentId });
    expect(own.title).toBe("Secret");
    expect(own.isPrivate).toBe(true);

    // … everybody else cannot.
    await expect(
      query(member, documents.getById, { documentId }),
    ).rejects.toThrow(/Unauthorized/i);

    // The page can be made public again.
    await mutation(owner, documents.update, {
      id: documentId,
      isPrivate: false,
    });
    const shared = await query(member, documents.getById, { documentId });
    expect(shared.title).toBe("Secret");
  });
});

describe("activity pagination", () => {
  it("returns pages of the audit log", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    for (let index = 0; index < 30; index += 1) {
      await owner.run(async (ctx: any) => {
        await ctx.db.insert("activity", {
          workspaceId,
          userId: "user_owner",
          userName: "Owner",
          action: `event.${index}`,
          createdAt: Date.now() + index,
        });
      });
    }

    const first = await query(owner, activity.auditLogPaginated, {
      workspaceId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(first.page).toHaveLength(10);
    expect(first.isDone).toBe(false);
    expect(first.continueCursor).toBeTruthy();

    const second = await query(owner, activity.auditLogPaginated, {
      workspaceId,
      paginationOpts: { numItems: 10, cursor: first.continueCursor },
    });
    expect(second.page).toHaveLength(10);
    expect(second.page[0]._id).not.toBe(first.page[0]._id);
  });
});

describe("demo helpers", () => {
  it("refuses to run without the demo key", async () => {
    const t = convexTest(schema);
    const owner = t.withIdentity({ subject: "user_owner", name: "Owner" });

    await expect(
      mutation(owner, demo.seed, { key: "wrong-key" }),
    ).rejects.toThrow();
  });
});
