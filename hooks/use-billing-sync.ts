"use client";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { DAY_MS, PERIOD_DAYS } from "@/lib/plans";

/**
 * Keeps the subscription in sync with the clock.
 *
 * When a billing period has elapsed we renew it (which also applies a
 * downgrade that was scheduled for the end of the period and issues the
 * renewal invoice).
 */
export const useBillingSync = () => {
  const { workspaceId } = useWorkspace();
  const renew = useMutation(api.billing.renewSubscription);
  const renewing = useRef(false);

  const subscription = useQuery(
    api.billing.getSubscription,
    workspaceId ? { workspaceId: workspaceId as never } : ("skip" as never),
  );

  useEffect(() => {
    if (!subscription || !workspaceId) return;
    const end = subscription.currentPeriodEnd;
    if (!end) return;

    const period = PERIOD_DAYS[subscription.cycle] * DAY_MS;
    const now = Date.now();

    // Only renew once the period has ended, and not more than a full
    // period later (otherwise a workspace that was inactive would be
    // charged for a very long time).
    if (now <= end || now > end + period) return;
    if (renewing.current) return;

    renewing.current = true;
    renew({ workspaceId: workspaceId as never })
      .catch(() => undefined)
      .finally(() => {
        renewing.current = false;
      });
  }, [subscription, workspaceId, renew]);

  return subscription;
};
