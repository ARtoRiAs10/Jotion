import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, mutation } from "./_generated/server";
import {
  createRazorpayOrder,
  isRazorpayConfigured,
  toPaise,
  verifyRazorpaySignature,
} from "../lib/razorpay";
import { getIdentity, identityName, logActivity, requireRole } from "./helpers";
import { getPlan } from "../lib/plans";

/**
 * Razorpay.
 *
 * The checkout creates an order through Razorpay, the browser widget collects
 * the payment and the signature is verified on the server before the
 * subscription is activated.
 */

/** Creates a Razorpay order for an open invoice. */
export const createOrder = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
    planName: string;
  }> => {
    // An action cannot read the database — it asks the internal query.
    const checkout = await ctx.runQuery(internal.billing.getCheckoutInvoice, {
      invoiceId: args.invoiceId,
    });

    if (!isRazorpayConfigured()) {
      throw new Error(
        "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      );
    }

    const plan = getPlan(checkout.plan);
    const order = await createRazorpayOrder({
      // The invoice is stored in cents (USD); Razorpay charges in paise (INR).
      // 1 USD is billed as 83 INR — the rate is configurable.
      amountInPaise: toPaise(
        (Number(checkout.amount) / 100) *
          Number(process.env.RAZORPAY_INR_PER_USD ?? 83),
      ),
      receipt: checkout.invoiceNumber,
      notes: {
        invoiceId: args.invoiceId,
        plan: checkout.plan,
        email: checkout.email ?? "",
      },
    });

    if (!order) throw new Error("Razorpay is not configured");

    await ctx.runMutation(internal.billing.attachRazorpayOrder, {
      invoiceId: args.invoiceId,
      orderId: order.id,
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID!,
      planName: plan.name,
    };
  },
});

/**
 * Verifies the payment and activates the subscription.
 */
export const verifyPayment = mutation({
  args: {
    invoiceId: v.id("invoices"),
    razorpayOrderId: v.string(),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; plan?: string; planName?: string; alreadyPaid?: boolean }> => {
    const identity = await getIdentity(ctx);
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new Error("Invoice not found");
    await requireRole(ctx, invoice.workspaceId, ["owner"]);

    if (invoice.status === "paid") {
      return { ok: true, alreadyPaid: true };
    }
    if (invoice.status !== "open") {
      throw new Error("This checkout session has expired");
    }

    const valid = await verifyRazorpaySignature({
      orderId: args.razorpayOrderId,
      paymentId: args.razorpayPaymentId,
      signature: args.razorpaySignature,
    });

    if (!valid) {
      throw new Error("The payment could not be verified");
    }

    const now = Date.now();
    const planId = invoice.plan as never;
    const plan = getPlan(planId);

    await ctx.db.patch(invoice.workspaceId, {
      plan: planId,
      billingCycle: invoice.cycle,
      seats: invoice.seats,
      subscriptionStatus: "active",
      subscriptionId: `rzp_${args.razorpayPaymentId}`,
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

    await logActivity(ctx, {
      workspaceId: invoice.workspaceId,
      userId: identity.subject,
      userName: identityName(identity),
      action: "billing.payment_razorpay",
      documentId: undefined,
      metadata: {
        plan: planId,
        amount: invoice.amount,
        paymentId: args.razorpayPaymentId,
      },
    });

    return { ok: true, plan: plan.id, planName: plan.name };
  },
});
