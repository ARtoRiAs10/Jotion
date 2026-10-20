"use client";

import {
  Avatar,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { useUser } from "@clerk/clerk-react";
import { ChevronsUpDown, CreditCard, LogOut, Settings, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@clerk/clerk-react";

export const UserMenu = () => {
  const { user } = useUser();
  const { plan, workspace } = useWorkspace();
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div
          role="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm notion-hover hover:bg-accent"
        >
          <Avatar className="h-6 w-6">
            <AvatarImage src={user?.imageUrl} />
          </Avatar>
          <span className="flex min-w-0 flex-col text-left">
            <span className="truncate text-[13px] font-medium">
              {user?.fullName ?? "Member"}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {workspace?.name ?? "Jotion"}
            </span>
          </span>
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start" side="right" sideOffset={8}>
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-sm font-medium">{user?.fullName}</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {user?.emailAddresses[0]?.emailAddress}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings?tab=billing")}>
          <CreditCard className="mr-2 h-4 w-4" />
          Billing & plans
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/pricing")}>
          <Sparkles className="mr-2 h-4 w-4" />
          Plans & pricing
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
          Current plan:{" "}
          <span className="font-medium text-foreground">{plan.name}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <SignOutButton>
            <div className="flex w-full items-center">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </div>
          </SignOutButton>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
