import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "@/convex/schema";
import * as billing from "@/convex/billing";
import * as workspaces from "@/convex/workspaces";
import * as documents from "@/convex/documents";

const DAY = 24 * 60 * 60 * 1000;

/* eslint-disable @typescript-eslint/no-explicit-any */
const mutation = (t: any, fn: any, args: any) => t.mutation(fn, args);
const query = (t: any, fn: any, args: any) => t.query(fn, args);

/**
 * Creates a workspace with an owner and returns the ids needed by the tests.
 */
const seedWorkspace = async (t: any, plan = "free") => {
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

describe("billing.checkout", () => {
  it("creates a pending invoice and activates the plan on payment", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t);

    const session = await mutation(owner, billing.startCheckout, {
      workspaceId,
      plan: "plus",
      cycle: "monthly",
      seats: 3,
    });

    expect(session.subtotal).toBe(3600);
    expect(session.amount).toBe(3600);
    expect(session.plan).toBe("plus");

    // The invoice is pending until the payment completes.
    const before = await query(owner, billing.getSubscription, { workspaceId });
    expect(before.plan).toBe("free");
    expect(before.invoices[0].status).toBe("open");

    await mutation(owner, billing.completeCheckout, {
      invoiceId: session.invoiceId,
    });

    const after = await query(owner, billing.getSubscription, { workspaceId });
    expect(after.plan).toBe("plus");
    expect(after.cycle).toBe("monthly");
    expect(after.invoices[0].status).toBe("paid");
    expect(after.currentPeriodEnd).toBeGreaterThan(Date.now());
  });

  it("applies a promo code and the tax rate", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t);

    await mutation(owner, billing.updateBillingDetails, {
      workspaceId,
      taxRate: 0.2,
    });

    const session = await mutation(owner, billing.startCheckout, {
      workspaceId,
      plan: "plus",
      cycle: "monthly",
      seats: 1,
      couponCode: "JOTION20",
    });

    expect(session.subtotal).toBe(1200);
    expect(session.discount).toBe(240);
    expect(session.tax).toBe(192);
    expect(session.amount).toBe(1152);
    expect(session.couponCode).toBe("JOTION20");
  });

  it("rejects an unknown promo code", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t);

    await expect(
      mutation(owner, billing.startCheckout, {
        workspaceId,
        plan: "plus",
        cycle: "monthly",
        seats: 1,
        couponCode: "NOT-A-CODE",
      }),
    ).rejects.toThrow(/not recognised/i);
  });

  it("refuses to let a non-owner start a checkout", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t);
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

    await expect(
      mutation(member, billing.startCheckout, {
        workspaceId,
        plan: "plus",
        cycle: "monthly",
        seats: 1,
      }),
    ).rejects.toThrow(/Forbidden/i);
  });
});

describe("billing.plan changes", () => {
  it("upgrades immediately with a prorated invoice", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t);

    // Start on Plus, 30 days ago, so half of the period is left.
    await owner.run(async (ctx: any) => {
      const workspace = await ctx.db.get(workspaceId);
      const now = Date.now();
      await ctx.db.patch(workspaceId, {
        plan: "plus",
        billingCycle: "monthly",
        currentPeriodStart: now - 15 * DAY,
        currentPeriodEnd: now + 15 * DAY,
      });
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: "user_second",
        email: "second@acme.test",
        role: "member",
        createdAt: now,
      });
    });

    const result = await mutation(owner, billing.changePlan, {
      workspaceId,
      plan: "business",
      cycle: "monthly",
    });

    expect(result.proration).toBe(true);
    // two seats, half a period left: (24 - 12) * 2 * 0.5 = $12
    expect(result.amount).toBe(1200);

    const subscription = await query(owner, billing.getSubscription, { workspaceId });
    expect(subscription.plan).toBe("business");
    expect(subscription.scheduledPlan).toBeUndefined();
  });

  it("schedules a downgrade for the end of the period", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t, "plus");

    const result = await mutation(owner, billing.changePlan, {
      workspaceId,
      plan: "free",
      cycle: "monthly",
    });

    expect(result.scheduled).toBe(true);

    const subscription = await query(owner, billing.getSubscription, { workspaceId });
    // The current plan is kept until the period ends …
    expect(subscription.plan).toBe("plus");
    // … but the downgrade is scheduled.
    expect(subscription.scheduledPlan).toBe("free");
    expect(subscription.scheduledAt).toBeGreaterThan(Date.now());

    // …and the scheduled change can be cancelled again.
    await mutation(owner, billing.cancelScheduledChange, { workspaceId });
    const cancelled = await query(owner, billing.getSubscription, { workspaceId });
    expect(cancelled.scheduledPlan).toBeUndefined();
  });

  it("applies a scheduled downgrade when the period renews", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t);

    const now = Date.now();
    await owner.run(async (ctx: any) => {
      await ctx.db.patch(workspaceId, {
        plan: "plus",
        billingCycle: "monthly",
        currentPeriodStart: now - 31 * DAY,
        currentPeriodEnd: now - DAY,
        scheduledPlan: "free",
        scheduledCycle: "monthly",
        scheduledAt: now - DAY,
      });
    });

    await mutation(owner, billing.renewSubscription, { workspaceId });

    const subscription = await query(owner, billing.getSubscription, { workspaceId });
    expect(subscription.plan).toBe("free");
    expect(subscription.scheduledPlan).toBeUndefined();
    expect(subscription.currentPeriodEnd).toBeGreaterThan(Date.now());
  });
});

describe("billing.seats", () => {
  it("charges added seats prorated and credits removed seats", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t);

    const now = Date.now();
    await owner.run(async (ctx: any) => {
      await ctx.db.patch(workspaceId, {
        plan: "plus",
        billingCycle: "monthly",
        currentPeriodStart: now - 15 * DAY,
        currentPeriodEnd: now + 15 * DAY,
      });
    });

    const added = await mutation(owner, billing.updateSeats, {
      workspaceId,
      seats: 2,
    });
    // one extra seat, half a period: 1 * $12 * 0.5 = $6
    expect(added.amount).toBe(600);

    const removed = await mutation(owner, billing.updateSeats, {
      workspaceId,
      seats: 1,
    });
    expect(removed.amount).toBe(-600);
  });
});

describe("billing.promo codes & payment methods", () => {
  it("creates a workspace coupon and applies it", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t);

    const couponId = await mutation(owner, billing.createCoupon, {
      workspaceId,
      code: "launch50",
      percentOff: 50,
    });
    expect(couponId).toBeTruthy();

    const session = await mutation(owner, billing.startCheckout, {
      workspaceId,
      plan: "plus",
      cycle: "monthly",
      seats: 1,
      couponCode: "LAUNCH50",
    });
    expect(session.discount).toBe(600);
  });

  it("stores payment methods and keeps one default", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t);

    const first = await mutation(owner, billing.addPaymentMethod, {
      workspaceId,
      brand: "Visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2029,
    });
    const second = await mutation(owner, billing.addPaymentMethod, {
      workspaceId,
      brand: "Mastercard",
      last4: "4444",
      expMonth: 1,
      expYear: 2030,
    });

    let subscription = await query(owner, billing.getSubscription, { workspaceId });
    expect(subscription.paymentMethods).toHaveLength(2);
    expect(subscription.paymentMethods.find((m: any) => m._id === first)?.isDefault).toBe(
      true,
    );

    await mutation(owner, billing.setDefaultPaymentMethod, {
      paymentMethodId: second,
    });
    subscription = await query(owner, billing.getSubscription, { workspaceId });
    expect(
      subscription.paymentMethods.find((m: any) => m._id === second)?.isDefault,
    ).toBe(true);

    // Removing the default promotes another card.
    await mutation(owner, billing.removePaymentMethod, { paymentMethodId: second });
    subscription = await query(owner, billing.getSubscription, { workspaceId });
    expect(
      subscription.paymentMethods.find((m: any) => m._id === first)?.isDefault,
    ).toBe(true);
  });
});

describe("workspaces.members", () => {
  it("enforces the guest limit of the plan", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t, "free");

    // The free plan allows 10 guests.
    for (let index = 0; index < 10; index += 1) {
      await mutation(owner, workspaces.inviteMember, {
        workspaceId,
        email: `guest${index}@acme.test`,
        role: "guest",
      });
    }

    await expect(
      mutation(owner, workspaces.inviteMember, {
        workspaceId,
        email: "guest-too-many@acme.test",
        role: "guest",
      }),
    ).rejects.toThrow(/allows 10 guests/i);
  });

  it("enforces the member limit of the plan", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t, "free");

    // The free plan allows 3 members (the owner counts as one).
    await mutation(owner, workspaces.inviteMember, {
      workspaceId,
      email: "member1@acme.test",
      role: "member",
    });
    await mutation(owner, workspaces.inviteMember, {
      workspaceId,
      email: "member2@acme.test",
      role: "member",
    });

    await expect(
      mutation(owner, workspaces.inviteMember, {
        workspaceId,
        email: "member3@acme.test",
        role: "member",
      }),
    ).rejects.toThrow(/allows 3 members/i);
  });
});

describe("documents.page access", () => {
  it("keeps a restricted page away from members without access", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t);

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
    // The invitation is claimed the first time the member signs in.
    await mutation(member, workspaces.ensureDefault, {});

    const documentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Secret",
    });

    // Without restrictions everybody in the workspace can read the page.
    const visible = await query(member, documents.getById, { documentId });
    expect(visible.title).toBe("Secret");

    await mutation(owner, documents.setRestricted, {
      id: documentId,
      isRestricted: true,
    });

    // Now the member is locked out…
    await expect(
      query(member, documents.getById, { documentId }),
    ).rejects.toThrow(/Unauthorized/i);

    // …until they are given access.
    await mutation(owner, documents.setPageAccess, {
      documentId,
      userId: "user_member",
      permission: "comment",
    });

    const allowed = await query(member, documents.getById, { documentId });
    expect(allowed.title).toBe("Secret");

    const permission = await query(member, documents.getMyPermission, {
      documentId,
    });
    expect(permission).toBe("comment");

    // A "comment" permission still forbids editing.
    await expect(
      mutation(member, documents.update, {
        id: documentId,
        title: "Hacked",
      }),
    ).rejects.toThrow(/do not have permission/i);

    // The owner can still edit.
    await mutation(owner, documents.update, { id: documentId, title: "Renamed" });
    const updated = await query(owner, documents.getById, { documentId });
    expect(updated.title).toBe("Renamed");
  });

  it("never leaks the password of a published page", async () => {
    const t = convexTest(schema);
    const { owner, workspaceId } = await seedWorkspace(t);

    const documentId = await mutation(owner, documents.create, {
      workspaceId,
      title: "Public",
    });
    await mutation(owner, documents.setPublicAccess, {
      id: documentId,
      publicAccess: "read",
      password: "hunter2",
    });

    const anonymous = t.withIdentity({ subject: "anonymous" });
    const published = await query(anonymous, documents.getById, { documentId });
    expect(published.password).toBeUndefined();
    expect(published.hasPassword).toBe(true);

    await expect(
      mutation(anonymous, documents.verifyPublicPassword, {
        documentId,
        password: "wrong",
      }),
    ).rejects.toThrow(/Incorrect password/i);

    const ok = await mutation(anonymous, documents.verifyPublicPassword, {
      documentId,
      password: "hunter2",
    });
    expect(ok).toBe(true);
  });
});
