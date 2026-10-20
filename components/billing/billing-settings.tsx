"use client";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgePercent,
  CreditCard,
  Download,
  Minus,
  Plus,
  Receipt,
  RefreshCw,
  Settings2,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BillingCycle,
  PLANS,
  PlanId,
  describeLimit,
  formatMoney,
  getPlan,
  planChangePreview,
  remainingFraction,
  toCents,
} from "@/lib/plans";
import { formatDate } from "@/lib/utils";

const CARD_BRANDS = ["Visa", "Mastercard", "Amex", "Discover"];

/** The plan we suggest when the user opens the "change plan" dialog. */
const nextPlanFor = (current: PlanId): PlanId => {
  if (current === "free") return "plus";
  if (current === "plus") return "business";
  if (current === "business") return "enterprise";
  return "enterprise";
};

const UsageMeter = ({
  label,
  used,
  limit,
  hint,
}: {
  label: string;
  used: number;
  /** `null` means unlimited. */
  limit: number | null;
  hint?: string;
}) => {
  const unlimited = limit === null || limit === Number.POSITIVE_INFINITY;
  const percent = unlimited
    ? 0
    : Math.min(100, Math.round((used / Math.max(1, limit as number)) * 100));
  const over = !unlimited && used > (limit as number);

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground">
          {unlimited ? "Unlimited" : `${used} / ${limit}`}
        </p>
      </div>
      <p className="mt-1 text-lg font-semibold">
        {unlimited ? "∞" : used}
        {!unlimited && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            of {describeLimit(limit)}
          </span>
        )}
      </p>
      {!unlimited && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full ${
              over ? "bg-destructive" : percent > 80 ? "bg-amber-500" : "bg-foreground"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
};

export const BillingSettings = () => {
  const { workspaceId, isOwner } = useWorkspace();
  const router = useRouter();

  const subscription = useQuery(api.billing.getSubscription, {
    workspaceId: workspaceId as never,
  });
  const changePlan = useMutation(api.billing.changePlan);
  const cancelSubscription = useMutation(api.billing.cancelSubscription);
  const resumeSubscription = useMutation(api.billing.resumeSubscription);
  const updateSeats = useMutation(api.billing.updateSeats);
  const cancelScheduledChange = useMutation(api.billing.cancelScheduledChange);
  const addPaymentMethod = useMutation(api.billing.addPaymentMethod);
  const removePaymentMethod = useMutation(api.billing.removePaymentMethod);
  const setDefaultPaymentMethod = useMutation(api.billing.setDefaultPaymentMethod);
  const createCoupon = useMutation(api.billing.createCoupon);
  const removeCoupon = useMutation(api.billing.removeCoupon);
  const updateBillingDetails = useMutation(api.billing.updateBillingDetails);

  const [seats, setSeats] = useState<number | undefined>(undefined);
  const [showCancel, setShowCancel] = useState(false);
  const [planDialog, setPlanDialog] = useState<PlanId | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [cardDialog, setCardDialog] = useState(false);
  const [card, setCard] = useState({
    brand: "Visa",
    number: "",
    expiry: "",
    cvc: "",
    name: "",
  });
  const [couponDialog, setCouponDialog] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: "",
    percentOff: "20",
    amountOff: "",
    plans: [] as string[],
    description: "",
  });
  const [details, setDetails] = useState({
    taxRate: "",
    billingEmail: "",
    billingAddress: "",
  });

  const currentSeats = seats ?? subscription?.seats ?? 1;

  const fraction = useMemo(() => {
    if (!subscription?.currentPeriodStart || !subscription.currentPeriodEnd) {
      return 1;
    }
    return remainingFraction(
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
    );
  }, [subscription]);

  if (!subscription) {
    return <p className="text-sm text-muted-foreground">Loading your plan…</p>;
  }

  const preview = planDialog
    ? planChangePreview({
        from: subscription.plan as PlanId,
        to: planDialog,
        cycle,
        seats: subscription.seats,
        fraction,
      })
    : null;

  const onChangePlan = async () => {
    if (!planDialog) return;
    try {
      const result = await changePlan({
        workspaceId: workspaceId as never,
        plan: planDialog,
        cycle,
      });
      if (result && "scheduled" in result && result.scheduled) {
        toast.success(
          `Downgrade scheduled — your plan changes on ${formatDate(
            (result as { scheduledAt?: number }).scheduledAt ?? Date.now(),
          )}`,
        );
      } else {
        toast.success("Your plan has been upgraded");
      }
      setPlanDialog(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not change the plan",
      );
    }
  };

  const onAddCard = async () => {
    const digits = card.number.replace(/\D/g, "");
    if (digits.length < 12) {
      toast.error("Please enter a valid card number");
      return;
    }
    if (!/^\d{2}\s*\/\s*\d{2}$/.test(card.expiry.trim())) {
      toast.error("Please enter the expiry date as MM / YY");
      return;
    }
    const [month, year] = card.expiry.split("/").map((part) => part.trim());
    try {
      await addPaymentMethod({
        workspaceId: workspaceId as never,
        brand: card.brand,
        last4: digits.slice(-4),
        expMonth: Number(month),
        expYear: 2000 + Number(year),
        name: card.name || undefined,
        makeDefault: subscription.paymentMethods.length === 0,
      });
      setCardDialog(false);
      setCard({ brand: "Visa", number: "", expiry: "", cvc: "", name: "" });
      toast.success("Payment method added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add the card",
      );
    }
  };

  const onCreateCoupon = async () => {
    try {
      await createCoupon({
        workspaceId: workspaceId as never,
        code: couponForm.code,
        percentOff: Number(couponForm.percentOff) || 0,
        amountOff: couponForm.amountOff
          ? toCents(Number(couponForm.amountOff))
          : 0,
        plans: couponForm.plans,
        description: couponForm.description || undefined,
      });
      setCouponDialog(false);
      setCouponForm({
        code: "",
        percentOff: "20",
        amountOff: "",
        plans: [],
        description: "",
      });
      toast.success("Promo code created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create the code",
      );
    }
  };

  const onSaveDetails = async () => {
    try {
      await updateBillingDetails({
        workspaceId: workspaceId as never,
        taxRate: details.taxRate
          ? Number(details.taxRate) / 100
          : undefined,
        billingEmail: details.billingEmail || undefined,
        billingAddress: details.billingAddress || undefined,
      });
      toast.success("Billing details updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the details",
      );
    }
  };

  const downloadInvoice = (invoice: {
    invoiceNumber: string;
    description?: string;
    amount: number;
    subtotal?: number;
    discount?: number;
    tax?: number;
    status: string;
    createdAt: number;
    items?: string[];
    currency: string;
  }) => {
    const rows = [
      ["Invoice", invoice.invoiceNumber],
      ["Date", formatDate(invoice.createdAt)],
      ["Description", invoice.description ?? ""],
      ["Subtotal", formatMoney(invoice.subtotal ?? invoice.amount, invoice.currency)],
      ...(invoice.discount
        ? [["Discount", `-${formatMoney(invoice.discount, invoice.currency)}`]]
        : []),
      ...(invoice.tax ? [["Tax", formatMoney(invoice.tax, invoice.currency)]] : []),
      ["Total", formatMoney(invoice.amount, invoice.currency)],
      ["Status", invoice.status],
    ];
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${invoice.invoiceNumber}</title><style>body{font-family:ui-sans-serif,system-ui;padding:40px;color:#111}h1{font-size:20px}table{border-collapse:collapse;margin-top:24px;width:100%;max-width:520px}td{padding:8px 0;border-bottom:1px solid #eee}td:last-child{text-align:right;font-variant-numeric:tabular-nums}</style></head><body><h1>Jotion — Invoice ${invoice.invoiceNumber}</h1><table>${rows
      .map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`)
      .join("")}</table>${
      invoice.items?.length
        ? `<h2 style="font-size:14px;margin-top:32px">Line items</h2><ul>${invoice.items
            .map((item) => `<li>${item}</li>`)
            .join("")}</ul>`
        : ""
    }</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${invoice.invoiceNumber}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/*  Current plan                                                    */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-lg border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Current plan</p>
            <p className="text-2xl font-bold tracking-tight">
              {subscription.planName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {subscription.price === 0
                ? "Free forever"
                : `$${subscription.price} per member per month, billed ${subscription.cycle}`}
              {subscription.status === "trialing" && subscription.trialEndsAt
                ? ` · trial ends ${formatDate(subscription.trialEndsAt)}`
                : ""}
              {subscription.status === "canceled" && " · canceled"}
            </p>
            {subscription.currentPeriodEnd && (
              <p className="mt-1 text-xs text-muted-foreground">
                {subscription.status === "canceled" ? "Access until" : "Renews on"}{" "}
                {formatDate(subscription.currentPeriodEnd)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/pricing")}
            >
              Compare plans
            </Button>
            {subscription.plan !== "free" && isOwner && (
              <Button
                size="sm"
                onClick={() => {
                  setCycle(subscription.cycle);
                  setPlanDialog(nextPlanFor(subscription.plan as PlanId));
                }}
              >
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Change plan
              </Button>
            )}
          </div>
        </div>

        {subscription.scheduledPlan && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            <span className="flex-1">
              Your plan is scheduled to change to{" "}
              {getPlan(subscription.scheduledPlan).name} on{" "}
              {formatDate(subscription.scheduledAt ?? Date.now())}.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={async () => {
                await cancelScheduledChange({
                  workspaceId: workspaceId as never,
                });
                toast.success("Scheduled change canceled");
              }}
            >
              Keep current plan
            </Button>
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UsageMeter
            label="Members"
            used={subscription.usage.seats}
            limit={subscription.limits.members}
            hint="Paid seats in this workspace"
          />
          <UsageMeter
            label="Guests"
            used={subscription.usage.guests}
            limit={subscription.limits.guests}
            hint="Guests are free, but limited per plan"
          />
          <UsageMeter
            label="Pages"
            used={subscription.usage.pages}
            limit={subscription.limits.pages}
          />
          <UsageMeter
            label="Databases"
            used={subscription.usage.databases}
            limit={subscription.limits.databases}
          />
          <UsageMeter
            label="Blocks per page"
            used={0}
            limit={subscription.limits.blocksPerPage}
            hint="Maximum blocks a single page may contain"
          />
          <UsageMeter
            label="Version history"
            used={subscription.limits.versionHistoryDays ?? 0}
            limit={subscription.limits.versionHistoryDays}
            hint={
              subscription.limits.versionHistoryDays === 0
                ? "Not included in this plan"
                : "Days of history kept per page"
            }
          />
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/*  Seats                                                           */}
      {/* ---------------------------------------------------------------- */}
      {isOwner && (
        <div className="rounded-lg border p-5">
          <h3 className="text-sm font-semibold">Seats</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Add seats to give more people full access. Seat changes are prorated
            for the rest of the billing period.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => setSeats(Math.max(1, currentSeats - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              min={1}
              value={currentSeats}
              onChange={(event) =>
                setSeats(Math.max(1, Number(event.target.value) || 1))
              }
              className="w-24 text-center"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => setSeats(currentSeats + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={currentSeats === subscription.seats}
              onClick={async () => {
                try {
                  const result = await updateSeats({
                    workspaceId: workspaceId as never,
                    seats: currentSeats,
                  });
                  setSeats(undefined);
                  toast.success(
                    result.amount < 0
                      ? `Seats updated — ${formatMoney(
                          Math.abs(result.amount),
                        )} credited to your account`
                      : "Seats updated",
                  );
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not update the seats",
                  );
                }
              }}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Update seats
            </Button>
            <span className="text-xs text-muted-foreground">
              {subscription.seats} seat{subscription.seats === 1 ? "" : "s"} ·{" "}
              {formatMoney(
                (subscription.price ?? 0) * 100 * currentSeats,
              )}{" "}
              / month
            </span>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/*  Payment methods                                                 */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-lg border p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CreditCard className="h-4 w-4" />
          Payment method
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {subscription.paymentMethods.length === 0
            ? "Add a payment method when you upgrade to a paid plan."
            : "Cards used for this workspace."}
        </p>
        <div className="mt-3 space-y-2">
          {subscription.paymentMethods.map((method) => (
            <div
              key={method._id}
              className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">
                {method.brand} ending in {method.last4}
                <span className="ml-2 text-xs text-muted-foreground">
                  expires {String(method.expMonth).padStart(2, "0")}/
                  {String(method.expYear).slice(-2)}
                </span>
              </span>
              {method.isDefault && (
                <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                  Default
                </span>
              )}
              {isOwner && !method.isDefault && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={async () => {
                    await setDefaultPaymentMethod({
                      paymentMethodId: method._id,
                    });
                    toast.success("Default card updated");
                  }}
                >
                  Make default
                </Button>
              )}
              {isOwner && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive"
                  onClick={async () => {
                    await removePaymentMethod({
                      paymentMethodId: method._id,
                    });
                    toast.success("Payment method removed");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {isOwner && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => setCardDialog(true)}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add payment method
          </Button>
        )}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/*  Billing details                                                 */}
      {/* ---------------------------------------------------------------- */}
      {isOwner && (
        <div className="rounded-lg border p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Settings2 className="h-4 w-4" />
            Billing details
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="billing-email">Billing email</Label>
              <Input
                id="billing-email"
                type="email"
                defaultValue={subscription.billingEmail ?? ""}
                placeholder="billing@company.com"
                onChange={(event) =>
                  setDetails({ ...details, billingEmail: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tax-rate">Tax rate (%)</Label>
              <Input
                id="tax-rate"
                type="number"
                min={0}
                max={100}
                defaultValue={Math.round((subscription.taxRate ?? 0) * 100)}
                onChange={(event) =>
                  setDetails({ ...details, taxRate: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="billing-address">Billing address</Label>
              <Input
                id="billing-address"
                defaultValue={subscription.billingAddress ?? ""}
                placeholder="1 Infinite Loop, Cupertino"
                onChange={(event) =>
                  setDetails({ ...details, billingAddress: event.target.value })
                }
              />
            </div>
          </div>
          <Button size="sm" className="mt-3" onClick={onSaveDetails}>
            Save details
          </Button>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/*  Promo codes                                                     */}
      {/* ---------------------------------------------------------------- */}
      {isOwner && (
        <div className="rounded-lg border p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <BadgePercent className="h-4 w-4" />
              Promo codes
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCouponDialog(true)}
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              New code
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Promo codes can be used by anyone who checks out in this workspace.
          </p>
          <div className="mt-3 space-y-2">
            {subscription.coupons.map((coupon) => (
              <div
                key={coupon._id}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-mono font-medium">{coupon.code}</span>
                <span className="flex-1 text-xs text-muted-foreground">
                  {coupon.percentOff
                    ? `${coupon.percentOff}% off`
                    : `${formatMoney(coupon.amountOff ?? 0)} off`}
                  {coupon.description ? ` · ${coupon.description}` : ""}
                  {coupon.redemptions
                    ? ` · ${coupon.redemptions} redemption${
                        coupon.redemptions === 1 ? "" : "s"
                      }`
                    : ""}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive"
                  onClick={async () => {
                    await removeCoupon({ couponId: coupon._id });
                    toast.success("Promo code removed");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {subscription.coupons.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No promo codes yet.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/*  Invoices                                                        */}
      {/* ---------------------------------------------------------------- */}
      <div className="rounded-lg border p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Receipt className="h-4 w-4" />
          Invoices
        </h3>
        <div className="mt-3 overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/60">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Invoice</th>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {subscription.invoices.map((invoice) => (
                <tr key={invoice._id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">
                    {invoice.invoiceNumber}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDate(invoice.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {formatMoney(invoice.amount, invoice.currency)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] ${
                        invoice.status === "paid"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100"
                          : invoice.status === "open"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-100"
                            : invoice.status === "scheduled"
                              ? "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-100"
                              : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => downloadInvoice(invoice)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {subscription.invoices.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No invoices yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/*  Manage subscription                                              */}
      {/* ---------------------------------------------------------------- */}
      {isOwner && subscription.plan !== "free" && (
        <div className="rounded-lg border p-5">
          <h3 className="text-sm font-semibold">Manage subscription</h3>
          {subscription.status === "canceled" ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-xs text-muted-foreground">
                Your subscription is canceled. Resume it to regain access to the
                paid features.
              </p>
              <Button
                size="sm"
                onClick={async () => {
                  await resumeSubscription({
                    workspaceId: workspaceId as never,
                  });
                  toast.success("Subscription resumed");
                }}
              >
                Resume
              </Button>
            </div>
          ) : showCancel ? (
            <div className="mt-3 space-y-3">
              <p className="flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Your workspace will move back to the Free plan at the end of
                the billing period. Your data is never deleted.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    await cancelSubscription({
                      workspaceId: workspaceId as never,
                    });
                    toast.success("Subscription canceled");
                    setShowCancel(false);
                  }}
                >
                  Confirm cancellation
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCancel(false)}
                >
                  Keep my plan
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-xs text-muted-foreground">
                Cancel any time. You keep access until the end of the period.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCancel(true)}
              >
                Cancel subscription
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/*  Dialogs                                                         */}
      {/* ---------------------------------------------------------------- */}
      <Dialog
        open={Boolean(planDialog)}
        onOpenChange={(open) => !open && setPlanDialog(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {preview?.isUpgrade ? "Upgrade" : "Change"} to{" "}
              {planDialog ? getPlan(planDialog).name : ""}
            </DialogTitle>
            <DialogDescription>
              {preview?.isUpgrade
                ? "Your new plan is available immediately. You only pay for the days left in the current billing period."
                : "Downgrades take effect at the end of the current billing period. You keep every feature until then."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {PLANS.filter((item) => item.id !== "free" || subscription.plan === "free").map(
                (item) => {
                  const active = planDialog === item.id;
                  const price = cycle === "annual" ? item.annual : item.monthly;
                  return (
                    <button
                      key={item.id}
                      role="button"
                      onClick={() => setPlanDialog(item.id)}
                      className={`rounded-lg border p-3 text-left notion-hover ${
                        active ? "border-foreground bg-accent/40" : ""
                      }`}
                    >
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {price === null ? "Custom" : `$${price} / member / month`}
                      </p>
                    </button>
                  );
                },
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Billing</span>
              <Select
                value={cycle}
                onValueChange={(value) => setCycle(value as BillingCycle)}
                className="w-40"
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </Select>
            </div>

            {preview && (
              <div className="rounded-lg border p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    New price per member / month
                  </span>
                  <span className="font-medium">
                    {formatMoney(preview.newUnitPrice)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Workspace total / month
                  </span>
                  <span className="font-medium">
                    {formatMoney(preview.newMonthlyTotal)}
                  </span>
                </div>
                {preview.isUpgrade && (
                  <>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Credit for unused time
                      </span>
                      <span className="font-medium text-emerald-600">
                        -{formatMoney(preview.credit)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Prorated charge
                      </span>
                      <span className="font-medium">
                        {formatMoney(preview.charge)}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t pt-3">
                      <span className="font-medium">Due today</span>
                      <span className="text-lg font-bold">
                        {formatMoney(preview.dueToday)}
                      </span>
                    </div>
                  </>
                )}
                {!preview.isUpgrade && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    You will not be charged today. The new limits apply on{" "}
                    {formatDate(subscription.currentPeriodEnd ?? Date.now())}.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog(null)}>
              Cancel
            </Button>
            <Button onClick={onChangePlan}>
              {preview?.isUpgrade ? "Upgrade now" : "Schedule change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cardDialog} onOpenChange={setCardDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a payment method</DialogTitle>
            <DialogDescription>
              Card details are only used for this demo — nothing is charged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Card brand</Label>
              <Select
                value={card.brand}
                onValueChange={(value) => setCard({ ...card, brand: value })}
              >
                {CARD_BRANDS.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-number">Card number</Label>
              <Input
                id="card-number"
                placeholder="4242 4242 4242 4242"
                value={card.number}
                onChange={(event) => setCard({ ...card, number: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="card-expiry">Expiry</Label>
                <Input
                  id="card-expiry"
                  placeholder="MM / YY"
                  value={card.expiry}
                  onChange={(event) => setCard({ ...card, expiry: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="card-cvc">CVC</Label>
                <Input
                  id="card-cvc"
                  placeholder="123"
                  value={card.cvc}
                  onChange={(event) => setCard({ ...card, cvc: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-name">Name on card</Label>
              <Input
                id="card-name"
                value={card.name}
                onChange={(event) => setCard({ ...card, name: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCardDialog(false)}>
              Cancel
            </Button>
            <Button onClick={onAddCard}>Add card</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={couponDialog} onOpenChange={setCouponDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create a promo code</DialogTitle>
            <DialogDescription>
              Discounts are applied to the subtotal of the invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="coupon-code">Code</Label>
              <Input
                id="coupon-code"
                value={couponForm.code}
                onChange={(event) =>
                  setCouponForm({ ...couponForm, code: event.target.value.toUpperCase() })
                }
                placeholder="LAUNCH50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-percent">Percent off</Label>
                <Input
                  id="coupon-percent"
                  type="number"
                  min={0}
                  max={100}
                  value={couponForm.percentOff}
                  onChange={(event) =>
                    setCouponForm({ ...couponForm, percentOff: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-amount">Amount off ($)</Label>
                <Input
                  id="coupon-amount"
                  type="number"
                  min={0}
                  value={couponForm.amountOff}
                  onChange={(event) =>
                    setCouponForm({ ...couponForm, amountOff: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Applies to</Label>
              <div className="flex flex-wrap gap-2">
                {PLANS.filter((item) => item.id !== "free").map((item) => {
                  const active = couponForm.plans.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      role="button"
                      onClick={() =>
                        setCouponForm({
                          ...couponForm,
                          plans: active
                            ? couponForm.plans.filter((id) => id !== item.id)
                            : [...couponForm.plans, item.id],
                        })
                      }
                      className={`rounded-md border px-2.5 py-1 text-xs notion-hover ${
                        active ? "bg-accent font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Leave empty to apply the code to every plan.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon-description">Description</Label>
              <Input
                id="coupon-description"
                value={couponForm.description}
                onChange={(event) =>
                  setCouponForm({ ...couponForm, description: event.target.value })
                }
                placeholder="Launch promotion"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCouponDialog(false)}>
              Cancel
            </Button>
            <Button onClick={onCreateCoupon}>Create code</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
