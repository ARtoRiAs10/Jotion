import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "@/convex/schema";
import * as comments from "@/convex/comments";
import * as databases from "@/convex/databases";
import * as devAuth from "@/convex/devAuth";
import * as documents from "@/convex/documents";
import * as workspaces from "@/convex/workspaces";
import {
  fromPaise,
  razorpayOptions,
  toPaise,
  verifyRazorpaySignature,
  verifyRazorpayWebhook,
} from "@/lib/razorpay";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mutation = (t: any, fn: any, args: any) => t.mutation(fn, args);
const query = (t: any, fn: any, args: any) => t.query(fn, args);
const action = (t: any, fn: any, args: any) => t.action(fn, args);

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

describe("razorpay", () => {
  it("verifies a payment signature", async () => {
    process.env.RAZORPAY_KEY_SECRET = "test_secret";

    // The signature of "order_1|pay_1" with the secret "test_secret".
    const { createHmac } = await import("node:crypto");
    const signature = createHmac("sha256", "test_secret")
      .update("order_1|pay_1")
      .digest("hex");

    const valid = await verifyRazorpaySignature({
      orderId: "order_1",
      paymentId: "pay_1",
      signature,
    });
    expect(valid).toBe(true);

    const invalid = await verifyRazorpaySignature({
      orderId: "order_1",
      paymentId: "pay_2",
      signature,
    });
    expect(invalid).toBe(false);
  });

  it("verifies a webhook signature", async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret";
    const { createHmac } = await import("node:crypto");
    const body = JSON.stringify({ event: "payment.captured" });
    const signature = createHmac("sha256", "webhook_secret")
      .update(body)
      .digest("hex");

    expect(await verifyRazorpayWebhook({ body, signature })).toBe(true);
    expect(
      await verifyRazorpayWebhook({ body: `${body} `, signature }),
    ).toBe(false);
  });

  it("converts between rupees and paise", () => {
    expect(toPaise(12.5)).toBe(1250);
    expect(fromPaise(1250)).toBe(12.5);
  });

  it("builds the checkout options", () => {
    const options = razorpayOptions({
      keyId: "rzp_test_123",
      orderId: "order_1",
      amountInPaise: 1250,
      name: "Jotion",
      description: "Plus plan",
      handler: () => undefined,
    });
    expect(options.key).toBe("rzp_test_123");
    expect(options.amount).toBe(1250);
    expect(options.currency).toBe("INR");
  });
});

describe("public comments", () => {
  it("accepts a comment on a published page", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const documentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Public page",
    });
    await mutation(owner, documents.setPublicAccess, {
      id: documentId,
      publicAccess: "comment",
    });

    const id = await mutation(owner, comments.addPublic, {
      documentId,
      name: "Visitor",
      body: "Nice page!",
    });
    expect(id).toBeTruthy();

    const list = await query(owner, comments.list, { documentId });
    expect(list).toHaveLength(1);
    expect(list[0].isPublic).toBe(true);
    expect(list[0].authorName).toBe("Visitor");
  });

  it("refuses comments on a page that is not published for comments", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const documentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Private page",
    });

    await expect(
      mutation(owner, comments.addPublic, {
        documentId,
        name: "Visitor",
        body: "Hello",
      }),
    ).rejects.toThrow(/does not accept comments/i);
  });

  it("rejects links and empty comments", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const documentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Public page",
    });
    await mutation(owner, documents.setPublicAccess, {
      id: documentId,
      publicAccess: "comment",
    });

    await expect(
      mutation(owner, comments.addPublic, {
        documentId,
        name: "Spammer",
        body: "Look at https://spam.example",
      }),
    ).rejects.toThrow(/Links are not allowed/i);

    await expect(
      mutation(owner, comments.addPublic, {
        documentId,
        name: "",
        body: "Hello",
      }),
    ).rejects.toThrow(/name and a comment are required/i);
  });
});

describe("database permissions", () => {
  it("hides a database from members without access", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

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

    const databaseId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Secret database",
    });

    // Everybody may see it by default.
    const visible = await query(member, databases.getDatabase, { databaseId });
    expect(visible.permission).toBe("edit");

    // The owner restricts it.
    await mutation(owner, databases.setDefaultPermission, {
      databaseId,
      permission: "none",
    });

    await expect(
      query(member, databases.getDatabase, { databaseId }),
    ).rejects.toThrow(/do not have access/i);

    // …and gives the member access again.
    await mutation(owner, databases.setAccess, {
      databaseId,
      userId: "user_member",
      permission: "view",
    });

    const allowed = await query(member, databases.getDatabase, { databaseId });
    expect(allowed.permission).toBe("view");

    // A view permission does not allow writing.
    const rowId = await mutation(owner, databases.createRow, {
      databaseId,
      title: "Row",
    });
    await expect(
      mutation(member, databases.setRowValue, {
        documentId: rowId,
        key: "status-0",
        type: "select",
        value: "Done",
      }),
    ).rejects.toThrow(/do not have permission/i);
  });

  it("lists and removes the access entries", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

    const databaseId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Projects",
    });

    await mutation(owner, databases.setAccess, {
      databaseId,
      email: "guest@acme.test",
      permission: "comment",
    });

    const access = await query(owner, databases.listAccess, { databaseId });
    expect(access).toHaveLength(1);
    expect(access[0].permission).toBe("comment");

    await mutation(owner, databases.removeAccess, { accessId: access[0]._id });
    const empty = await query(owner, databases.listAccess, { databaseId });
    expect(empty).toHaveLength(0);
  });

  it("only lets owners and admins change the permissions", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seed(t);

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

    const databaseId = await mutation(owner, databases.createDatabase, {
      workspaceId,
      name: "Projects",
    });

    await expect(
      mutation(member, databases.setDefaultPermission, {
        databaseId,
        permission: "none",
      }),
    ).rejects.toThrow(/owners and admins/i);
  });
});

describe("the development sign-in", () => {
  it("is disabled unless the deployment enables it", async () => {
    const t = convexTest(schema);
    const owner = t.withIdentity({ subject: "user_owner", name: "Owner" });

    // The test environment has no ALLOW_DEV_AUTH variable.
    await expect(action(owner, devAuth.listUsers, {})).rejects.toThrow(
      /disabled on this deployment/i,
    );
    await expect(
      action(owner, devAuth.signIn, { userId: "dev_ada" }),
    ).rejects.toThrow(/disabled on this deployment/i);
  });

  it("reports its status instead of failing", async () => {
    const t = convexTest(schema);
    const owner = t.withIdentity({ subject: "user_owner", name: "Owner" });

    const status = await action(owner, devAuth.status, {});
    expect(status.enabled).toBe(false);
    expect(status.hasSecret).toBe(false);
  });
});
