"use client";

import { Spinner } from "@/components/spinner";
import { useConvexAuth } from "convex/react";
import { redirect } from "next/navigation";

import { CommandPalette } from "@/components/command/command-palette";
import { UpgradeModal } from "@/components/billing/upgrade-modal";
import { UserSync } from "@/components/providers/user-sync";
import { WorkspaceProvider } from "@/components/providers/workspace-provider";
import { useBillingSync } from "@/hooks/use-billing-sync";
import { MobileTopBar } from "@/components/sidebar/mobile-top-bar";
import { Sidebar } from "@/components/sidebar/sidebar";

/**
 * Keeps the subscription up to date (renewals + scheduled downgrades).
 * Has to live inside the workspace provider to know the active workspace.
 */
const BillingSync = () => {
  useBillingSync();
  return null;
};

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return redirect("/");
  }

  return (
    <>
      <UserSync />
      <WorkspaceProvider>
        <BillingSync />
        <div className="flex h-full flex-col dark:bg-[#191919]">
          <MobileTopBar />
          <div className="flex h-full min-h-0">
            <Sidebar />
            <main className="relative h-full flex-1 overflow-y-auto">
              <CommandPalette />
              <UpgradeModal />
              {children}
            </main>
          </div>
        </div>
      </WorkspaceProvider>
    </>
  );
};

export default MainLayout;
