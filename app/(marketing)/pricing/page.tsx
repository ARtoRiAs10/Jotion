"use client";

import { PlanCard } from "@/components/billing/plan-card";
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
import { api } from "@/convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import {
  ArrowRight,
  Building2,
  GraduationCap,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSafeSearchParams } from "@/hooks/use-safe-search-params";
import { useState } from "react";
import { toast } from "sonner";
import {
  BillingCycle,
  COMPARISON_ROWS,
  FEATURE_LABELS,
  FEATURE_MATRIX,
  PLANS,
  Plan,
  PlanId,
  PRICING_FAQ,
  annualSavingsPercent,
  formatMoney,
  toCents,
} from "@/lib/plans";

const PricingPage = () => {
  const router = useRouter();
  const params = useSafeSearchParams();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [seats, setSeats] = useState(1);
  const [contactOpen, setContactOpen] = useState(
    params.get("contact") === "1",
  );
  const [contact, setContact] = useState({
    name: "",
    email: "",
    company: "",
    seats: "50",
  });

  const subscriptions = useQuery(
    api.billing.mySubscriptions,
    isAuthenticated ? {} : ("skip" as never),
  );

  const owned = subscriptions?.find((subscription) => subscription.role === "owner");
  const currentPlan = owned?.plan as PlanId | undefined;

  const onSelect = (plan: Plan) => {
    if (!isAuthenticated) {
      toast("Sign in to choose a plan");
      router.push("/");
      return;
    }
    if (plan.id === "enterprise") {
      setContactOpen(true);
      return;
    }
    if (!owned) {
      toast.error("Only workspace owners can change the plan");
      return;
    }
    router.push(
      `/billing/checkout?plan=${plan.id}&cycle=${cycle}&seats=${seats}&workspace=${owned._id}`,
    );
  };

  const submitContact = () => {
    toast.success("Thanks! Our sales team will get in touch shortly.");
    setContactOpen(false);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-24">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          Simple, transparent pricing
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Choose the plan that fits your team
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Start free, upgrade when you need more history, guests and security.
          Every paid plan includes a 14 day free trial.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <div className="inline-flex items-center rounded-lg border p-1">
            {(["monthly", "annual"] as BillingCycle[]).map((option) => (
              <button
                key={option}
                role="button"
                onClick={() => setCycle(option)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium notion-hover ${
                  cycle === option ? "bg-accent" : "text-muted-foreground"
                }`}
              >
                {option === "monthly" ? "Monthly" : "Annual"}
                {option === "annual" && (
                  <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100">
                    -20%
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-2 rounded-lg border px-2 py-1">
            <span className="text-sm text-muted-foreground">Seats</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setSeats((value) => Math.max(1, value - 1))}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="w-6 text-center text-sm font-medium">{seats}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setSeats((value) => Math.min(500, value + 1))}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {seats > 1 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Every plan is priced per member. {seats} seats are billed for
            whatever you choose below.
          </p>
        )}
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            cycle={cycle}
            currentPlan={currentPlan}
            isOwner={Boolean(owned)}
            onSelect={onSelect}
            disabled={isLoading}
            seats={seats}
          />
        ))}
      </div>

      <section className="mt-20">
        <h2 className="text-center text-2xl font-bold tracking-tight">
          Compare all features
        </h2>
        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-secondary/60">
                <th className="px-4 py-3 text-left font-medium">Features</th>
                {PLANS.map((plan) => (
                  <th key={plan.id} className="px-4 py-3 text-center font-medium">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label} className="border-t">
                  <td className="px-4 py-2.5 font-medium">{row.label}</td>
                  {PLANS.map((plan) => (
                    <td
                      key={plan.id}
                      className="px-4 py-2.5 text-center text-muted-foreground"
                    >
                      {row.values[plan.id]}
                    </td>
                  ))}
                </tr>
              ))}
              {Object.keys(FEATURE_LABELS).map((key) => (
                <tr key={key} className="border-t">
                  <td className="px-4 py-2.5 font-medium">
                    {FEATURE_LABELS[key as keyof typeof FEATURE_LABELS]}
                  </td>
                  {PLANS.map((plan) => {
                    const value =
                      FEATURE_MATRIX[plan.id][
                        key as keyof typeof FEATURE_LABELS
                      ];
                    return (
                      <td
                        key={plan.id}
                        className="px-4 py-2.5 text-center text-muted-foreground"
                      >
                        {value === true
                          ? "✓"
                          : value === false
                            ? "—"
                            : String(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-20">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-5">
            <GraduationCap className="h-5 w-5 text-amber-500" />
            <h3 className="mt-3 text-sm font-semibold">Education & non-profits</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Students, teachers and registered non-profits get 50% off any paid
              plan. Use the promo code{" "}
              <span className="font-mono text-xs">EDU50</span> at checkout.
            </p>
          </div>
          <div className="rounded-xl border p-5">
            <Building2 className="h-5 w-5 text-sky-500" />
            <h3 className="mt-3 text-sm font-semibold">Enterprise</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              SAML SCIM, data residency, custom retention and a dedicated
              success manager.{" "}
              <button
                role="button"
                className="text-foreground underline underline-offset-2"
                onClick={() => setContactOpen(true)}
              >
                Talk to sales
              </button>
              .
            </p>
          </div>
          <div className="rounded-xl border p-5">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            <h3 className="mt-3 text-sm font-semibold">Annual billing</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pay once a year and save up to{" "}
              {Math.max(
                ...PLANS.map((plan) => annualSavingsPercent(plan)),
                0,
              )}
              % — that is{" "}
              {formatMoney(
                Math.round(
                  toCents(12) *
                    PLANS.filter((p) => p.id !== "free" && p.id !== "enterprise").reduce(
                      (sum, plan) => sum + (plan.monthly ?? 0) - (plan.annual ?? 0),
                      0,
                    ),
                ),
              )}{" "}
              less per member every year.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-20">
        <h2 className="text-center text-2xl font-bold tracking-tight">
          Frequently asked questions
        </h2>
        <div className="mx-auto mt-6 max-w-2xl space-y-3">
          {PRICING_FAQ.map((item) => (
            <details
              key={item.question}
              className="group rounded-lg border px-4 py-3 open:bg-accent/30"
            >
              <summary className="cursor-pointer list-none text-sm font-medium">
                {item.question}
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-20 rounded-2xl border bg-secondary/40 p-10 text-center">
        <h2 className="text-2xl font-bold tracking-tight">
          Ready to move your work into one place?
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Create a workspace in seconds and invite your team. No credit card
          required to get started.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={() => router.push("/documents")}>
            Get started for free
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setContactOpen(true)}>
            Talk to sales
          </Button>
        </div>
      </section>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Talk to our sales team</DialogTitle>
            <DialogDescription>
              Tell us about your team and we will send a tailored quote within
              one business day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">Name</Label>
              <Input
                id="contact-name"
                value={contact.name}
                onChange={(event) =>
                  setContact({ ...contact, name: event.target.value })
                }
                placeholder="Ada Lovelace"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Work email</Label>
              <Input
                id="contact-email"
                type="email"
                value={contact.email}
                onChange={(event) =>
                  setContact({ ...contact, email: event.target.value })
                }
                placeholder="ada@company.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="contact-company">Company</Label>
                <Input
                  id="contact-company"
                  value={contact.company}
                  onChange={(event) =>
                    setContact({ ...contact, company: event.target.value })
                  }
                  placeholder="Analytical Engines"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contact-seats">Seats</Label>
                <Input
                  id="contact-seats"
                  type="number"
                  min={1}
                  value={contact.seats}
                  onChange={(event) =>
                    setContact({ ...contact, seats: event.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitContact}>Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PricingPage;
