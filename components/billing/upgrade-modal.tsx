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
import { PLANS, formatMoney, getPlan } from "@/lib/plans";
import { UpgradeFeature, UPGRADE_EVENT, requestUpgrade } from "@/lib/upgrade";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const FEATURE_COPY: Record<UpgradeFeature, string> = {
  guests: "invite more guests",
  pages: "create more pages",
  blocks: "add more blocks to a page",
  uploads: "upload bigger files",
  history: "keep version history for longer",
  members: "add more members",
  databases: "create more databases",
  general: "unlock every feature",
};

export const UpgradeModal = () => {
  const router = useRouter();
  const { plan, workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();
  const [feature, setFeature] = useState<UpgradeFeature>("general");

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { reason?: string; feature?: UpgradeFeature }
        | undefined;
      setReason(detail?.reason);
      setFeature(detail?.feature ?? "general");
      setOpen(true);
    };
    window.addEventListener(UPGRADE_EVENT, handler);
    return () => window.removeEventListener(UPGRADE_EVENT, handler);
  }, []);

  const upgrade = PLANS.find((item) => item.id === "plus") ?? getPlan("plus");
  const price = upgrade.monthly ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Upgrade to keep going
          </DialogTitle>
          <DialogDescription>
            {reason ??
              `Your ${plan.name} plan does not allow you to ${FEATURE_COPY[feature]}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border p-4">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight">
              ${price}
            </span>
            <span className="text-sm text-muted-foreground">
              per member / month
            </span>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {upgrade.features.slice(1, 5).map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            You keep every page, database and comment. Nothing is deleted when
            you upgrade.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Not now
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              router.push(
                `/pricing?workspace=${workspace?._id ?? ""}&upgrade=${upgrade.id}`,
              );
            }}
          >
            See plans
            <ArrowUpRight className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Convenience helper for components that catch a plan limit error. */
export const handlePlanError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes("plan")) {
    requestUpgrade(message);
  }
  return message;
};

export const formatPlanPrice = (planId: string, cycle: "monthly" | "annual") => {
  const target = getPlan(planId);
  const value = cycle === "annual" ? target.annual : target.monthly;
  if (value === null) return "Custom";
  return `${formatMoney(value * 100)}`;
};
