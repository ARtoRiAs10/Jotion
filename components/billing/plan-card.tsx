"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BillingCycle,
  Plan,
  annualSavingsPercent,
  formatMoney,
  toCents,
} from "@/lib/plans";
import { Check } from "lucide-react";

export const PlanCard = ({
  plan,
  cycle,
  currentPlan,
  isOwner,
  onSelect,
  disabled,
  seats = 1,
}: {
  plan: Plan;
  cycle: BillingCycle;
  currentPlan?: string;
  isOwner: boolean;
  onSelect: (plan: Plan) => void;
  disabled?: boolean;
  seats?: number;
}) => {
  const price = cycle === "annual" ? plan.annual : plan.monthly;
  const isCurrent = currentPlan === plan.id;
  const savings = annualSavingsPercent(plan);
  const seatCents = price === null ? null : toCents(price);
  const total =
    seatCents === null
      ? null
      : seatCents * Math.max(1, seats) * (cycle === "annual" ? 12 : 1);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border p-6",
        plan.highlight && !isCurrent && "border-foreground shadow-sm",
        isCurrent && "border-foreground bg-accent/30",
      )}
    >
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">{plan.name}</h3>
        {isCurrent && (
          <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
            Current plan
          </span>
        )}
        {plan.highlight && !isCurrent && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-900 dark:text-amber-100">
            Most popular
          </span>
        )}
      </div>

      <p className="mt-2 min-h-[40px] text-sm text-muted-foreground">
        {plan.tagline}
      </p>

      <div className="mt-4 flex items-baseline gap-1">
        {price === null ? (
          <span className="text-3xl font-bold tracking-tight">Custom</span>
        ) : (
          <>
            <span className="text-4xl font-bold tracking-tight">
              ${price}
            </span>
            <span className="text-sm text-muted-foreground">
              / member / month
            </span>
          </>
        )}
      </div>
      <p className="mt-1 h-4 text-[11px] text-muted-foreground">
        {price === null
          ? "Tailored to your organisation"
          : cycle === "annual"
            ? `Billed annually · save ${savings}%`
            : "Billed monthly · cancel anytime"}
      </p>

      {total !== null && seats > 1 && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {formatMoney(total)} for {seats} seat{seats === 1 ? "" : "s"}
          {cycle === "annual" ? " / year" : " / month"}
        </p>
      )}

      <Button
        className="mt-5 w-full"
        variant={isCurrent ? "outline" : plan.highlight ? "default" : "outline"}
        disabled={isCurrent || disabled}
        onClick={() => onSelect(plan)}
      >
        {isCurrent
          ? "Your current plan"
          : plan.id === "enterprise"
            ? "Contact sales"
            : isOwner
              ? `Upgrade to ${plan.name}`
              : `Choose ${plan.name}`}
      </Button>

      <ul className="mt-6 space-y-2.5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
