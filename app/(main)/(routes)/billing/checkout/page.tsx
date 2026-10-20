"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Check,
  CreditCard,
  Lock,
  Minus,
  Plus,
  ShieldCheck,
  Tag,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BillingCycle,
  buildQuote,
  formatMoney,
  getPlan,
  toCents,
} from "@/lib/plans";

interface Session {
  sessionId: string;
  plan: string;
  cycle: BillingCycle;
  seats: number;
  amount: number;
  subtotal: number;
  discount: number;
  tax: number;
  couponCode?: string;
  planName: string;
}

/** Luhn check — the same validation a real payment processor would run. */
const isValidCardNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
};

const detectBrand = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (/^4/.test(digits)) return "Visa";
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "Amex";
  if (/^6/.test(digits)) return "Discover";
  return "Card";
};

const CheckoutPage = () => {
  const router = useRouter();
  const params = useSearchParams();
  const planId = params.get("plan") ?? "plus";
  const cycle = (params.get("cycle") ?? "monthly") as BillingCycle;
  const workspaceId = params.get("workspace") ?? undefined;
  const initialSeats = Number(params.get("seats") ?? "1") || 1;

  const startCheckout = useMutation(api.billing.startCheckout);
  const completeCheckout = useMutation(api.billing.completeCheckout);
  const cancelCheckout = useMutation(api.billing.cancelCheckout);
  const addPaymentMethod = useMutation(api.billing.addPaymentMethod);

  const [step, setStep] = useState<"details" | "payment">("details");
  const [session, setSession] = useState<Session | null>(null);
  const [seats, setSeats] = useState(initialSeats);
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | undefined>();
  const [couponError, setCouponError] = useState<string | undefined>();
  const [processing, setProcessing] = useState(false);
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "", name: "" });

  const plan = getPlan(planId);

  const quote = useQuery(
    api.billing.quote,
    workspaceId
      ? {
          workspaceId: workspaceId as never,
          plan: planId,
          cycle,
          seats,
          couponCode: appliedCoupon,
        }
      : ("skip" as never),
  );

  const localQuote = useMemo(
    () =>
      buildQuote({
        planId: planId as never,
        cycle,
        seats,
        couponCode: appliedCoupon,
      }),
    [planId, cycle, seats, appliedCoupon],
  );

  const total = quote?.total ?? localQuote.total;
  const subtotal = quote?.subtotal ?? localQuote.subtotal;
  const discount = quote?.discount ?? localQuote.discount;
  const tax = quote?.tax ?? localQuote.tax;
  const unit = cycle === "annual" ? plan.annual : plan.monthly;

  const onApplyCoupon = () => {
    if (!coupon.trim()) {
      setAppliedCoupon(undefined);
      setCouponError(undefined);
      return;
    }
    const validation = buildQuote({
      planId: planId as never,
      cycle,
      seats,
      couponCode: coupon,
    });
    if (validation.couponValid) {
      setAppliedCoupon(coupon.trim().toUpperCase());
      setCouponError(undefined);
      toast.success("Promo code applied");
    } else {
      setAppliedCoupon(undefined);
      setCouponError(validation.couponReason ?? "This promo code is not valid");
    }
  };

  const onContinue = async () => {
    if (!workspaceId) {
      toast.error("Select a workspace before upgrading");
      router.push("/pricing");
      return;
    }
    setProcessing(true);
    try {
      const result = await startCheckout({
        workspaceId: workspaceId as never,
        plan: planId,
        cycle,
        seats,
        couponCode: appliedCoupon,
      });
      setSession(result as unknown as Session);
      setStep("payment");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start checkout",
      );
    } finally {
      setProcessing(false);
    }
  };

  const onPay = async () => {
    if (!session) return;
    if (!isValidCardNumber(card.number)) {
      toast.error("Please enter a valid card number");
      return;
    }
    if (!/^\d{2}\s*\/\s*\d{2}$/.test(card.expiry.trim())) {
      toast.error("Please enter the expiry date as MM / YY");
      return;
    }
    if (card.cvc.trim().length < 3) {
      toast.error("Please enter the security code");
      return;
    }

    setProcessing(true);
    try {
      const [month, year] = card.expiry.split("/").map((part) => part.trim());
      await addPaymentMethod({
        workspaceId: workspaceId as never,
        brand: detectBrand(card.number),
        last4: card.number.replace(/\D/g, "").slice(-4),
        expMonth: Number(month),
        expYear: 2000 + Number(year),
        name: card.name || undefined,
        makeDefault: true,
      });

      await completeCheckout({ invoiceId: session.sessionId as never });
      toast.success(`Welcome to ${plan.name}! Your workspace has been upgraded.`);
      router.push("/settings?tab=billing");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Payment could not be processed",
      );
    } finally {
      setProcessing(false);
    }
  };

  const onCancel = async () => {
    if (session) {
      await cancelCheckout({ invoiceId: session.sessionId as never }).catch(
        () => undefined,
      );
    }
    router.push("/pricing");
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <button
        role="button"
        onClick={onCancel}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground notion-hover hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to pricing
      </button>

      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        <div className="rounded-xl border p-6">
          <h1 className="text-xl font-bold tracking-tight">Checkout</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "details"
              ? `You are upgrading your workspace to the ${plan.name} plan.`
              : `Enter your card details to activate the ${plan.name} plan.`}
          </p>

          {step === "details" ? (
            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <Label>Number of seats</Label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-9 p-0"
                    onClick={() => setSeats((value) => Math.max(1, value - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    value={seats}
                    onChange={(event) =>
                      setSeats(Math.max(1, Number(event.target.value) || 1))
                    }
                    className="w-24 text-center"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-9 p-0"
                    onClick={() => setSeats((value) => value + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    ${unit ?? 0} per seat per month
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="promo">Promo code</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="promo"
                    value={coupon}
                    onChange={(event) => setCoupon(event.target.value.toUpperCase())}
                    onKeyDown={(event) => event.key === "Enter" && onApplyCoupon()}
                    placeholder="JOTION20"
                    className="uppercase"
                  />
                  <Button variant="outline" onClick={onApplyCoupon}>
                    <Tag className="mr-2 h-4 w-4" />
                    Apply
                  </Button>
                </div>
                {couponError && (
                  <p className="text-[11px] text-destructive">{couponError}</p>
                )}
                {appliedCoupon && !couponError && (
                  <p className="text-[11px] text-emerald-600">
                    Promo code {appliedCoupon} applied.
                  </p>
                )}
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={processing}
                onClick={onContinue}
              >
                {processing ? "Preparing checkout…" : "Continue to payment"}
              </Button>

              <ul className="space-y-1.5 text-[11px] text-muted-foreground">
                <li className="flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-emerald-500" />
                  14 day free trial on every paid plan
                </li>
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  Cancel any time, keep your data
                </li>
              </ul>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>Card details</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="4242 4242 4242 4242"
                    value={card.number}
                    onChange={(event) =>
                      setCard({ ...card, number: event.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="MM / YY"
                    value={card.expiry}
                    onChange={(event) =>
                      setCard({ ...card, expiry: event.target.value })
                    }
                  />
                  <Input
                    placeholder="CVC"
                    value={card.cvc}
                    onChange={(event) =>
                      setCard({ ...card, cvc: event.target.value })
                    }
                  />
                </div>
                <Input
                  placeholder="Name on card"
                  value={card.name}
                  onChange={(event) => setCard({ ...card, name: event.target.value })}
                />
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={processing || !session}
                onClick={onPay}
              >
                {processing ? "Processing…" : `Pay ${formatMoney(total)}`}
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" />
                Secure checkout. This is a demo environment — no real card is
                charged.
              </p>
            </div>
          )}
        </div>

        <div className="h-fit rounded-xl border bg-secondary/40 p-6">
          <h2 className="text-sm font-semibold">Order summary</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium">{plan.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Billing</span>
              <span className="font-medium capitalize">{cycle}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Seats</span>
              <span className="font-medium">{seats}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Price per seat</span>
              <span className="font-medium">${unit ?? 0}</span>
            </div>
            {cycle === "annual" && (
              <div className="flex items-center justify-between text-emerald-600">
                <span>Annual saving</span>
                <span className="font-medium">
                  {formatMoney(
                    Math.round(
                      toCents(1) *
                        12 *
                        seats *
                        ((plan.monthly ?? 0) - (plan.annual ?? 0)),
                    ),
                  )}
                </span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex items-center justify-between text-emerald-600">
                <span>Promo {appliedCoupon}</span>
                <span className="font-medium">-{formatMoney(discount)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium">{formatMoney(tax)}</span>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <span className="text-sm font-medium">
              {cycle === "annual" ? "Due today (annual)" : "Due today (monthly)"}
            </span>
            <span className="text-lg font-bold">{formatMoney(total)}</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Subtotal {formatMoney(subtotal)}
            {cycle === "annual" ? " · billed for 12 months" : null}
          </p>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
