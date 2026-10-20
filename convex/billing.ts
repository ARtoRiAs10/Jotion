import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx, mutation, query } from "./_generated/server";
import {
  getIdentity,
  getUserId,
  identityName,
  logActivity,
  requireMembership,
  requireRole,
  scheduleMail,
  serialiseLimit,
  serialiseLimits,
} from "./helpers";
import { templates } from "../lib/mailer";
import {
  BillingCycle,
  Coupon,
  DAY_MS,
  PERIOD_DAYS,
  PlanId,
  buildQuote,
  discountFor,
  getPlan,
  isPlanId,
  priceFor,
  remainingFraction,
  seatMonthlyPrice,
  subscriptionTotal,
  validateCoupon,
} from "../lib/plans";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const normaliseCycle = (cycle?: string | null): BillingCycle =>
  cycle === "annual" ? "annual" : "monthly";

const normalisePlan = (plan?: string | null): PlanId =>
  isPlanId(plan) ? plan : "free";

const invoiceNumber = () =>
  `JOT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

const periodEnd = (cycle: BillingCycle, from = Date.now()) =>
  from + PERIOD_DAYS[cycle] * DAY_MS;

const periodStart = (cycle: BillingCycle, from = Date.now()) =>
  from - PERIOD_DAYS[cycle] * DAY_MS;

/**
 * Resolves a promo code. Workspace coupons take precedence over the
 * global catalogue in `lib/plans.ts`.
 */
const resolveCoupon = async (
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces"> | undefined,
  code: string | undefined,
  planId: PlanId,
) => {
  if (!code) return { coupon: undefined as Coupon | undefined, reason: undefined as string | undefined };
  const normalised = code.trim().toUpperCase();

  const workspaceCoupon = await ctx.db
    .query("coupons")
    .withIndex("by_code", (q) => q.eq("code", normalised))
    .first();

  if (workspaceCoupon) {
    if (workspaceCoupon.active === false) {
      return { coupon: undefined, reason: "This promo code is no longer active" };
    }
    if (
      workspaceCoupon.expiresAt &&
      workspaceCoupon.expiresAt < Date.now()
    ) {
      return { coupon: undefined, reason: "This promo code has expired" };
    }
    if (
      workspaceCoupon.maxRedemptions &&
      (workspaceCoupon.redemptions ?? 0) >= workspaceCoupon.maxRedemptions
    ) {
      return {
        coupon: undefined,
        reason: "This promo code has reached its redemption limit",
      };
    }
    const plans = (workspaceCoupon.plans ?? []) as PlanId[];
    if (plans.length > 0 && !plans.includes(planId)) {
      return {
        coupon: undefined,
        reason: `This promo code does not apply to the ${getPlan(planId).name} plan`,
      };
    }
    return {
      coupon: {
        code: workspaceCoupon.code,
        percentOff: workspaceCoupon.percentOff ?? 0,
        amountOff: workspaceCoupon.amountOff ?? 0,
        plans,
        description: workspaceCoupon.description,
      },
      reason: undefined,
    };
  }

  const validation = validateCoupon(normalised, planId);
  return {
    coupon: validation.valid ? validation.coupon : undefined,
    reason: validation.valid ? undefined : validation.reason,
  };
};

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export const getSubscription = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const { membership } = await requireMembership(ctx, args.workspaceId);
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Not found");

    const plan = getPlan(workspace.plan);
    const cycle = normaliseCycle(workspace.billingCycle);

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const pages = await ctx.db
      .query("documents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .take(100);

    const paymentMethods = await ctx.db
      .query("paymentMethods")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const coupons = await ctx.db
      .query("coupons")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const guests = members.filter((m) => m.role === "guest").length;
    const memberSeats = members.filter((m) => m.role !== "guest").length;
    // The workspace may have bought more seats than it currently uses.
    const paidSeats = Math.max(workspace.seats ?? 0, memberSeats);
    const databases = pages.filter((p) => p.type === "database").length;

    return {
      plan: plan.id,
      planName: plan.name,
      price: priceFor(plan.id, cycle),
      cycle,
      seats: Math.max(1, paidSeats),
      status: workspace.subscriptionStatus ?? "active",
      currentPeriodStart: workspace.currentPeriodStart,
      currentPeriodEnd: workspace.currentPeriodEnd,
      trialEndsAt: workspace.trialEndsAt,
      role: membership.role,
      limits: serialiseLimits(plan.limits),
      taxRate: workspace.taxRate ?? 0,
      billingEmail: workspace.billingEmail,
      billingAddress: workspace.billingAddress,
      billingCountry: workspace.billingCountry,
      scheduledPlan: workspace.scheduledPlan
        ? normalisePlan(workspace.scheduledPlan)
        : undefined,
      scheduledCycle: workspace.scheduledCycle
        ? normaliseCycle(workspace.scheduledCycle)
        : undefined,
      scheduledAt: workspace.scheduledAt,
      usage: {
        guests,
        guestLimit: serialiseLimit(plan.limits.guests),
        seats: paidSeats,
        seatLimit: serialiseLimit(plan.limits.members),
        pages: pages.length,
        pageLimit: serialiseLimit(plan.limits.pages),
        databases,
        databaseLimit: serialiseLimit(plan.limits.databases),
        blocksPerPageLimit: serialiseLimit(plan.limits.blocksPerPage),
        versionHistoryDays: serialiseLimit(plan.limits.versionHistoryDays),
        fileUploadMb: serialiseLimit(plan.limits.fileUploadMb),
      },
      invoices,
      paymentMethods: paymentMethods.sort((a, b) =>
        a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1,
      ),
      coupons,
      features: plan.features,
    };
  },
});

export const getInvoices = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.workspaceId);
    return await ctx.db
      .query("invoices")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .collect();
  },
});

/**
 * Price preview. Used by the checkout page, the billing settings and the
 * plan change dialog so that the client and the server always agree on the
 * amount that will be charged.
 */
export const quote = query({
  args: {
    workspaceId: v.optional(v.id("workspaces")),
    plan: v.string(),
    cycle: v.optional(v.string()),
    seats: v.optional(v.number()),
    couponCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspace = args.workspaceId
      ? await ctx.db.get(args.workspaceId)
      : null;
    const planId = normalisePlan(args.plan);
    const cycle = normaliseCycle(args.cycle);
    const seats = Math.max(1, args.seats ?? 1);
    const taxRate = workspace?.taxRate ?? 0;

    const { coupon, reason } = await resolveCoupon(
      ctx,
      args.workspaceId,
      args.couponCode,
      planId,
    );

    const result = buildQuote({
      planId,
      cycle,
      seats,
      couponCode: args.couponCode,
      coupon,
      taxRate,
    });

    return {
      ...result,
      couponReason: reason ?? result.couponReason,
      couponValid: Boolean(coupon) || !args.couponCode,
    };
  },
});

/** All workspaces the current user can see — used by the pricing page. */
export const mySubscriptions = query({
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const workspaces = await Promise.all(
      memberships.map(async (m) => {
        const workspace = await ctx.db.get(m.workspaceId);
        if (!workspace) return null;
        return {
          _id: workspace._id,
          name: workspace.name,
          icon: workspace.icon,
          plan: normalisePlan(workspace.plan),
          cycle: normaliseCycle(workspace.billingCycle),
          role: m.role,
          status: workspace.subscriptionStatus ?? "active",
        };
      }),
    );
    return workspaces.filter((w): w is NonNullable<typeof w> => Boolean(w));
  },
});

export const listCoupons = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.workspaceId);
    return await ctx.db
      .query("coupons")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

/* ------------------------------------------------------------------ */
/*  Checkout                                                           */
/* ------------------------------------------------------------------ */

/**
 * Starts a checkout session. A pending invoice is created so that the
 * checkout page can be rendered from a single source of truth.
 */
export const startCheckout = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    plan: v.string(),
    cycle: v.optional(v.string()),
    seats: v.optional(v.number()),
    couponCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    await requireRole(ctx, args.workspaceId, ["owner"]);

    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Not found");

    const planId = normalisePlan(args.plan);
    const plan = getPlan(planId);
    if (plan.monthly === null) {
      throw new Error("Enterprise plans require a sales conversation");
    }

    const cycle = normaliseCycle(args.cycle ?? workspace.billingCycle);
    const seats = Math.max(1, args.seats ?? workspace.seats ?? 1);

    const { coupon, reason } = await resolveCoupon(
      ctx,
      args.workspaceId,
      args.couponCode,
      planId,
    );
    if (args.couponCode && !coupon) {
      throw new Error(reason ?? "This promo code cannot be used");
    }

    const computed = buildQuote({
      planId,
      cycle,
      seats,
      couponCode: coupon?.code,
      coupon,
      taxRate: workspace.taxRate ?? 0,
    });

    // Any pending checkout is voided when a new one starts.
    const pending = await ctx.db
      .query("invoices")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    for (const invoice of pending) {
      if (invoice.status === "open") {
        await ctx.db.patch(invoice._id, { status: "void" });
      }
    }

    const start = Date.now();
    const invoiceId = await ctx.db.insert("invoices", {
      workspaceId: args.workspaceId,
      plan: planId,
      cycle,
      amount: computed.total,
      subtotal: computed.subtotal,
      discount: computed.discount,
      tax: computed.tax,
      currency: "USD",
      status: "open",
      seats,
      periodStart: start,
      periodEnd: periodEnd(cycle, start),
      createdAt: start,
      invoiceNumber: invoiceNumber(),
      couponCode: coupon?.code,
      items: [
        `${plan.name} plan — ${seats} seat${seats === 1 ? "" : "s"} (${
          cycle === "annual" ? "annual" : "monthly"
        })`,
      ],
      description: `${plan.name} plan — ${seats} seat${seats === 1 ? "" : "s"} (${
        cycle === "annual" ? "annual" : "monthly"
      })${coupon ? ` · promo ${coupon.code}` : ""}`,
    });

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      userName: identityName(identity),
      action: "billing.checkout_started",
      metadata: {
        plan: planId,
        cycle,
        seats,
        amount: computed.total,
        coupon: coupon?.code,
      },
    });

    return {
      sessionId: invoiceId,
      invoiceId,
      plan: planId,
      cycle,
      seats,
      amount: computed.total,
      subtotal: computed.subtotal,
      discount: computed.discount,
      tax: computed.tax,
      couponCode: coupon?.code,
      currency: "USD",
      planName: plan.name,
      periodEnd: periodEnd(cycle, start),
    };
  },
});

/** Completes the checkout: activates the plan and marks the invoice paid. */
export const completeCheckout = mutation({
  args: {
    invoiceId: v.id("invoices"),
    paymentMethodId: v.optional(v.id("paymentMethods")),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Checkout session not found");
    await requireRole(ctx, invoice.workspaceId, ["owner"]);

    if (invoice.status === "paid") {
      return { ok: true, alreadyPaid: true, invoice };
    }
    if (invoice.status !== "open") {
      throw new Error("This checkout session has expired");
    }

    const now = Date.now();
    const planId = normalisePlan(invoice.plan);
    const cycle = normaliseCycle(invoice.cycle);
    const plan = getPlan(planId);

    // Record the redemption of the promo code.
    if (invoice.couponCode) {
      const coupon = await ctx.db
        .query("coupons")
        .withIndex("by_code", (q) => q.eq("code", invoice.couponCode!))
        .first();
      if (coupon) {
        await ctx.db.patch(coupon._id, {
          redemptions: (coupon.redemptions ?? 0) + 1,
        });
      }
    }

    await ctx.db.patch(invoice.workspaceId, {
      plan: planId,
      billingCycle: cycle,
      seats: invoice.seats,
      subscriptionStatus: "active",
      subscriptionId: `sub_${invoice.invoiceNumber.toLowerCase()}`,
      currentPeriodStart: now,
      currentPeriodEnd: invoice.periodEnd,
      trialEndsAt: undefined,
      canceledAt: undefined,
      scheduledPlan: undefined,
      scheduledCycle: undefined,
      scheduledAt: undefined,
      updatedAt: now,
    });

    await ctx.db.patch(invoice._id, { status: "paid", paidAt: now });

    // Send the invoice to the billing e-mail of the workspace.
    const workspace = await ctx.db.get(invoice.workspaceId);
    const billingEmail =
      workspace?.billingEmail ??
      (await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", invoice.workspaceId))
        .collect())
        .find((member) => member.role === "owner")?.email;
    if (billingEmail) {
      const mail = templates.invoice(
        invoice.invoiceNumber,
        `${(invoice.amount / 100).toFixed(2)} USD`,
      );
      await scheduleMail(ctx, {
        to: billingEmail,
        subject: mail.subject,
        body: mail.body,
      });
    }

    await logActivity(ctx, {
      workspaceId: invoice.workspaceId,
      userId,
      userName: identityName(identity),
      action: "billing.subscription_started",
      metadata: {
        plan: planId,
        cycle,
        seats: invoice.seats,
        amount: invoice.amount,
        coupon: invoice.couponCode,
      },
    });

    return { ok: true, alreadyPaid: false, invoice, plan: plan.id, planName: plan.name };
  },
});

export const cancelCheckout = mutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Checkout session not found");
    await requireRole(ctx, invoice.workspaceId, ["owner"]);
    if (invoice.status === "open") {
      await ctx.db.patch(invoice._id, { status: "void" });
    }
    return true;
  },
});

/* ------------------------------------------------------------------ */
/*  Plan changes                                                       */
/* ------------------------------------------------------------------ */

/**
 * Upgrades take effect immediately (with prorated billing), downgrades are
 * scheduled for the end of the current billing period.
 */
export const changePlan = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    plan: v.string(),
    cycle: v.optional(v.string()),
    couponCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    await requireRole(ctx, args.workspaceId, ["owner"]);

    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Not found");

    const currentPlan = normalisePlan(workspace.plan);
    const nextPlan = normalisePlan(args.plan);
    if (nextPlan === currentPlan) {
      return { ok: true, unchanged: true };
    }

    const cycle = normaliseCycle(args.cycle ?? workspace.billingCycle);
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const seats = Math.max(
      1,
      workspace.seats ?? members.filter((m) => m.role !== "guest").length,
    );

    const currentAmount = subscriptionTotal(currentPlan, cycle, seats);
    const nextAmount = subscriptionTotal(nextPlan, cycle, seats);
    const isUpgrade = nextAmount > currentAmount;
    const now = Date.now();

    if (isUpgrade) {
      // Prorate the difference over the remaining period.
      const start = workspace.currentPeriodStart ?? periodStart(cycle, now);
      const end = workspace.currentPeriodEnd ?? periodEnd(cycle, now);
      const fraction = remainingFraction(start, end, now);

      const credit = Math.round(
        seatMonthlyPrice(currentPlan, cycle) * seats * fraction,
      );
      const charge = Math.round(
        seatMonthlyPrice(nextPlan, cycle) * seats * fraction,
      );
      const proration = Math.max(0, charge - credit);

      const invoiceId = await ctx.db.insert("invoices", {
        workspaceId: args.workspaceId,
        plan: nextPlan,
        cycle,
        amount: proration,
        subtotal: charge,
        discount: 0,
        tax: 0,
        currency: "USD",
        status: "paid",
        seats,
        periodStart: now,
        periodEnd: end,
        createdAt: now,
        invoiceNumber: invoiceNumber(),
        items: [
          `Prorated charge — ${getPlan(nextPlan).name} (${Math.round(
            fraction * 100,
          )}% of the period)`,
          credit > 0
            ? `Credit for the remaining time on ${getPlan(currentPlan).name}`
            : "No credit — new plan",
        ].filter(Boolean),
        description: `Upgrade to ${getPlan(nextPlan).name} (prorated)`,
        paidAt: now,
      });

      await ctx.db.patch(args.workspaceId, {
        plan: nextPlan,
        billingCycle: cycle,
        subscriptionStatus: "active",
        currentPeriodStart: start,
        currentPeriodEnd: end,
        scheduledPlan: undefined,
        scheduledCycle: undefined,
        scheduledAt: undefined,
        updatedAt: now,
      });

      await logActivity(ctx, {
        workspaceId: args.workspaceId,
        userId,
        userName: identityName(identity),
        action: "billing.plan_upgraded",
        metadata: { from: currentPlan, to: nextPlan, amount: proration, invoiceId },
      });

      return { ok: true, invoiceId, amount: proration, proration: true };
    }

    // Downgrade: scheduled at the end of the period.
    const end = workspace.currentPeriodEnd ?? periodEnd(cycle, now);
    const invoiceId = await ctx.db.insert("invoices", {
      workspaceId: args.workspaceId,
      plan: nextPlan,
      cycle,
      amount: 0,
      subtotal: 0,
      discount: 0,
      tax: 0,
      currency: "USD",
      status: "scheduled",
      seats,
      periodStart: now,
      periodEnd: end,
      createdAt: now,
      invoiceNumber: invoiceNumber(),
      scheduledFor: end,
      items: [`Scheduled downgrade to ${getPlan(nextPlan).name}`],
      description: `Downgrade to ${getPlan(nextPlan).name} scheduled`,
    });

    await ctx.db.patch(args.workspaceId, {
      scheduledPlan: nextPlan,
      scheduledCycle: cycle,
      scheduledAt: end,
      updatedAt: now,
    });

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      userName: identityName(identity),
      action: "billing.plan_downgrade_scheduled",
      metadata: { from: currentPlan, to: nextPlan },
    });

    return { ok: true, invoiceId, scheduled: true, scheduledAt: end };
  },
});

/**
 * Cancels a scheduled plan change (a pending downgrade).
 */
export const cancelScheduledChange = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    await requireRole(ctx, args.workspaceId, ["owner"]);
    await ctx.db.patch(args.workspaceId, {
      scheduledPlan: undefined,
      scheduledCycle: undefined,
      scheduledAt: undefined,
      updatedAt: Date.now(),
    });
    const scheduled = await ctx.db
      .query("invoices")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    for (const invoice of scheduled) {
      if (invoice.status === "scheduled") {
        await ctx.db.patch(invoice._id, { status: "void" });
      }
    }
    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId: identity.subject,
      action: "billing.scheduled_change_canceled",
    });
    return true;
  },
});

/**
 * Renews the billing period. Called when a period has elapsed: it applies
 * any scheduled downgrade and issues the renewal invoice.
 */
export const renewSubscription = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    await requireRole(ctx, args.workspaceId, ["owner"]);

    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Not found");

    const now = Date.now();
    const cycle = normaliseCycle(workspace.billingCycle);
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const seats = Math.max(
      1,
      workspace.seats ?? members.filter((m) => m.role !== "guest").length,
    );

    // Apply a scheduled downgrade first.
    let planId = normalisePlan(workspace.plan);
    if (workspace.scheduledPlan) {
      planId = normalisePlan(workspace.scheduledPlan);

      // The scheduled invoice is now settled — close it.
      const scheduledInvoices = await ctx.db
        .query("invoices")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect();
      for (const invoice of scheduledInvoices) {
        if (invoice.status === "scheduled") {
          await ctx.db.patch(invoice._id, {
            status: "void",
            description: `${invoice.description ?? "Plan change"} — applied`,
          });
        }
      }
    }

    const end = periodEnd(cycle, now);
    const computed = buildQuote({
      planId,
      cycle,
      seats,
      taxRate: workspace.taxRate ?? 0,
    });

    const invoiceId = await ctx.db.insert("invoices", {
      workspaceId: args.workspaceId,
      plan: planId,
      cycle,
      amount: computed.total,
      subtotal: computed.subtotal,
      discount: computed.discount,
      tax: computed.tax,
      currency: "USD",
      status: "paid",
      seats,
      periodStart: now,
      periodEnd: end,
      createdAt: now,
      invoiceNumber: invoiceNumber(),
      items: [
        `${getPlan(planId).name} plan — ${seats} seat${
          seats === 1 ? "" : "s"
        } (${cycle === "annual" ? "annual" : "monthly"}) renewal`,
      ],
      description: `${getPlan(planId).name} plan renewal`,
      paidAt: now,
    });

    await ctx.db.patch(args.workspaceId, {
      plan: planId,
      currentPeriodStart: now,
      currentPeriodEnd: end,
      scheduledPlan: undefined,
      scheduledCycle: undefined,
      scheduledAt: undefined,
      subscriptionStatus:
        workspace.subscriptionStatus === "canceled" ? "canceled" : "active",
      updatedAt: now,
    });

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      userName: identityName(identity),
      action: "billing.subscription_renewed",
      metadata: { plan: planId, amount: computed.total, invoiceId },
    });

    return { ok: true, invoiceId, amount: computed.total, plan: planId };
  },
});

/**
 * Adds or removes seats. Additional seats are charged prorated for the
 * remainder of the current period; removing seats issues a credit.
 */
export const updateSeats = mutation({
  args: { workspaceId: v.id("workspaces"), seats: v.number() },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    await requireRole(ctx, args.workspaceId, ["owner"]);

    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Not found");

    const seats = Math.max(1, Math.floor(args.seats));
    const plan = normalisePlan(workspace.plan);
    const cycle = normaliseCycle(workspace.billingCycle);
    const now = Date.now();

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const currentSeats = Math.max(
      1,
      workspace.seats ?? members.filter((m) => m.role !== "guest").length,
    );

    const start = workspace.currentPeriodStart ?? periodStart(cycle, now);
    const end = workspace.currentPeriodEnd ?? periodEnd(cycle, now);
    const fraction = remainingFraction(start, end, now);

    const difference = seats - currentSeats;
    const unit = seatMonthlyPrice(plan, cycle);
    const prorated = Math.round(unit * difference * fraction);

    const invoiceId = await ctx.db.insert("invoices", {
      workspaceId: args.workspaceId,
      plan,
      cycle,
      amount: Math.max(0, prorated),
      subtotal: Math.abs(prorated),
      discount: 0,
      tax: 0,
      currency: "USD",
      status: "paid",
      seats,
      periodStart: now,
      periodEnd: end,
      createdAt: now,
      invoiceNumber: invoiceNumber(),
      items: [
        difference >= 0
          ? `${difference} additional seat${difference === 1 ? "" : "s"} (prorated)`
          : `${Math.abs(difference)} seat${Math.abs(difference) === 1 ? "" : "s"} removed (credit)`,
      ],
      description: `Seats updated — ${seats} seat${seats === 1 ? "" : "s"}`,
      paidAt: now,
    });

    await ctx.db.patch(args.workspaceId, { seats, updatedAt: now });

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      userName: identityName(identity),
      action: "billing.seats_updated",
      metadata: { seats, amount: prorated },
    });

    return { ok: true, invoiceId, amount: prorated, seats };
  },
});

export const cancelSubscription = mutation({
  args: { workspaceId: v.id("workspaces"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    await requireRole(ctx, args.workspaceId, ["owner"]);

    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Not found");

    const now = Date.now();
    await ctx.db.patch(args.workspaceId, {
      subscriptionStatus: "canceled",
      canceledAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      userName: identityName(identity),
      action: "billing.subscription_canceled",
      metadata: { reason: args.reason },
    });

    return true;
  },
});

export const resumeSubscription = mutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    await requireRole(ctx, args.workspaceId, ["owner"]);

    await ctx.db.patch(args.workspaceId, {
      subscriptionStatus: "active",
      canceledAt: undefined,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      userName: identityName(identity),
      action: "billing.subscription_resumed",
    });

    return true;
  },
});

/** Starts a free trial for a paid plan (14 days). */
export const startTrial = mutation({
  args: { workspaceId: v.id("workspaces"), plan: v.string(), cycle: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const userId = identity.subject;
    await requireRole(ctx, args.workspaceId, ["owner"]);

    const planId = normalisePlan(args.plan);
    const cycle = normaliseCycle(args.cycle);
    const now = Date.now();

    await ctx.db.patch(args.workspaceId, {
      plan: planId,
      billingCycle: cycle,
      subscriptionStatus: "trialing",
      trialEndsAt: now + 14 * DAY_MS,
      currentPeriodStart: now,
      currentPeriodEnd: now + 14 * DAY_MS,
      updatedAt: now,
    });

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId,
      userName: identityName(identity),
      action: "billing.trial_started",
      metadata: { plan: planId },
    });

    return true;
  },
});

/* ------------------------------------------------------------------ */
/*  Payment methods                                                    */
/* ------------------------------------------------------------------ */

export const addPaymentMethod = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    brand: v.string(),
    last4: v.string(),
    expMonth: v.number(),
    expYear: v.number(),
    name: v.optional(v.string()),
    makeDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    await requireRole(ctx, args.workspaceId, ["owner"]);

    const existing = await ctx.db
      .query("paymentMethods")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    if (args.makeDefault || existing.length === 0) {
      for (const method of existing) {
        await ctx.db.patch(method._id, { isDefault: false });
      }
    }

    const id = await ctx.db.insert("paymentMethods", {
      workspaceId: args.workspaceId,
      brand: args.brand,
      last4: args.last4,
      expMonth: args.expMonth,
      expYear: args.expYear,
      name: args.name,
      isDefault: args.makeDefault || existing.length === 0,
      createdAt: Date.now(),
    });

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId: identity.subject,
      action: "billing.payment_method_added",
      metadata: { brand: args.brand, last4: args.last4 },
    });

    return id;
  },
});

export const removePaymentMethod = mutation({
  args: { paymentMethodId: v.id("paymentMethods") },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const method = await ctx.db.get(args.paymentMethodId);
    if (!method) throw new Error("Not found");
    await requireRole(ctx, method.workspaceId, ["owner"]);

    await ctx.db.delete(args.paymentMethodId);

    if (method.isDefault) {
      const remaining = await ctx.db
        .query("paymentMethods")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", method.workspaceId))
        .collect();
      if (remaining[0]) {
        await ctx.db.patch(remaining[0]._id, { isDefault: true });
      }
    }

    await logActivity(ctx, {
      workspaceId: method.workspaceId,
      userId: identity.subject,
      action: "billing.payment_method_removed",
      metadata: { last4: method.last4 },
    });

    return true;
  },
});

export const setDefaultPaymentMethod = mutation({
  args: { paymentMethodId: v.id("paymentMethods") },
  handler: async (ctx, args) => {
    const method = await ctx.db.get(args.paymentMethodId);
    if (!method) throw new Error("Not found");
    await requireRole(ctx, method.workspaceId, ["owner"]);

    const all = await ctx.db
      .query("paymentMethods")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", method.workspaceId))
      .collect();
    for (const item of all) {
      await ctx.db.patch(item._id, { isDefault: item._id === args.paymentMethodId });
    }
    return true;
  },
});

/* ------------------------------------------------------------------ */
/*  Coupons & billing details                                          */
/* ------------------------------------------------------------------ */

export const createCoupon = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    code: v.string(),
    percentOff: v.optional(v.number()),
    amountOff: v.optional(v.number()),
    plans: v.optional(v.array(v.string())),
    description: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    maxRedemptions: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    await requireRole(ctx, args.workspaceId, ["owner"]);

    const code = args.code.trim().toUpperCase();
    if (!code) throw new Error("A promo code is required");

    const percentOff = Math.min(100, Math.max(0, args.percentOff ?? 0));
    const amountOff = Math.max(0, args.amountOff ?? 0);
    if (percentOff === 0 && amountOff === 0) {
      throw new Error("A coupon needs a percentage or an amount discount");
    }

    const existing = await ctx.db
      .query("coupons")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (existing) throw new Error("This promo code already exists");

    const id = await ctx.db.insert("coupons", {
      workspaceId: args.workspaceId,
      code,
      percentOff,
      amountOff,
      plans: args.plans ?? [],
      description: args.description,
      expiresAt: args.expiresAt,
      maxRedemptions: args.maxRedemptions,
      redemptions: 0,
      active: true,
      createdAt: Date.now(),
    });

    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId: identity.subject,
      action: "billing.coupon_created",
      metadata: { code, percentOff, amountOff },
    });

    return id;
  },
});

export const removeCoupon = mutation({
  args: { couponId: v.id("coupons") },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    const coupon = await ctx.db.get(args.couponId);
    if (!coupon) throw new Error("Not found");
    if (!coupon.workspaceId) throw new Error("Not found");
    await requireRole(ctx, coupon.workspaceId, ["owner"]);
    await ctx.db.delete(args.couponId);
    await logActivity(ctx, {
      workspaceId: coupon.workspaceId,
      userId: identity.subject,
      action: "billing.coupon_removed",
      metadata: { code: coupon.code },
    });
    return true;
  },
});

export const updateBillingDetails = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    taxRate: v.optional(v.number()),
    billingEmail: v.optional(v.string()),
    billingAddress: v.optional(v.string()),
    billingCountry: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await getIdentity(ctx);
    await requireRole(ctx, args.workspaceId, ["owner"]);
    await ctx.db.patch(args.workspaceId, {
      taxRate: args.taxRate,
      billingEmail: args.billingEmail,
      billingAddress: args.billingAddress,
      billingCountry: args.billingCountry,
      updatedAt: Date.now(),
    });
    await logActivity(ctx, {
      workspaceId: args.workspaceId,
      userId: identity.subject,
      action: "billing.details_updated",
    });
    return await ctx.db.get(args.workspaceId);
  },
});

/** Applies a promo code to a workspace without changing the plan. */
export const applyCoupon = mutation({
  args: { workspaceId: v.id("workspaces"), code: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.workspaceId, ["owner"]);

    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Not found");

    const planId = normalisePlan(workspace.plan);
    const { coupon, reason } = await resolveCoupon(
      ctx,
      args.workspaceId,
      args.code,
      planId,
    );
    if (!coupon) throw new Error(reason ?? "This promo code cannot be used");

    const discount = discountFor(
      subscriptionTotal(planId, normaliseCycle(workspace.billingCycle), 1),
      coupon,
    );

    return { ok: true, coupon, discount };
  },
});
