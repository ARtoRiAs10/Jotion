"use client";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { useMobileSidebar } from "@/hooks/use-mobile-sidebar";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export const MobileTopBar = () => {
  const { workspace } = useWorkspace();
  const toggle = useMobileSidebar((store) => store.toggle);

  return (
    <div className="flex items-center gap-2 border-b bg-background px-2 py-1.5 md:hidden">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggle}>
        <Menu className="h-4 w-4" />
      </Button>
      <span className="truncate text-sm font-medium">
        {workspace?.icon ? `${workspace.icon} ` : ""}
        {workspace?.name ?? "Jotion"}
      </span>
    </div>
  );
};
