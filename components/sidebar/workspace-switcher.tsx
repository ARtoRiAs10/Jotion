"use client";

import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/components/providers/workspace-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMutation } from "convex/react";
import { Building2, Check, CreditCard, Plus, Settings, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export const WorkspaceSwitcher = () => {
  const { workspaces, workspace, setWorkspaceId, isOwner } = useWorkspace();
  const createWorkspace = useMutation(api.workspaces.create);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const onCreate = async () => {
    if (!name.trim()) return;
    const created = await createWorkspace({ name: name.trim(), icon: "🏠" });
    setName("");
    setCreating(false);
    setOpen(false);
    if (created) setWorkspaceId(created._id as string);
    toast.success("Workspace created");
  };

  return (
    <>
      <div className="flex h-10 items-center gap-2 px-2">
        <button
          onClick={() => setOpen(true)}
          className="group flex h-8 flex-1 items-center gap-2 rounded-md px-2 text-sm font-semibold notion-hover hover:bg-accent"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded bg-neutral-200 text-[13px] dark:bg-neutral-700">
            {workspace?.icon ?? "🪄"}
          </span>
          <span className="truncate">{workspace?.name ?? "Jotion"}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {workspace?.plan === "free" ? "Free" : workspace?.plan}
          </span>
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-base">Workspaces</DialogTitle>
            <DialogDescription className="text-xs">
              Switch between the workspaces you belong to.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 overflow-y-auto px-2">
            {workspaces.map((item) => (
              <button
                key={item._id}
                onClick={() => {
                  setWorkspaceId(item._id);
                  setOpen(false);
                  router.push("/documents");
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm notion-hover hover:bg-accent"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded bg-neutral-200 text-sm dark:bg-neutral-700">
                  {item.icon ?? "🏠"}
                </span>
                <span className="flex flex-col items-start">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-[11px] capitalize text-muted-foreground">
                    {item.role} · {item.plan === "free" ? "Free plan" : `${item.plan} plan`}
                  </span>
                </span>
                {workspace?._id === item._id && (
                  <Check className="ml-auto h-4 w-4 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>

          <DialogFooter className="flex-col gap-1 border-t p-2 sm:flex-col sm:space-y-0">
            <button
              onClick={() => {
                setCreating((value) => !value);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm notion-hover hover:bg-accent"
            >
              <Plus className="h-4 w-4" />
              Create a workspace
            </button>
            {creating && (
              <div className="flex w-full items-center gap-2 px-2 pb-1">
                <Input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && onCreate()}
                  placeholder="Workspace name"
                  className="h-8"
                />
                <Button size="sm" onClick={onCreate}>
                  Create
                </Button>
              </div>
            )}
            <button
              onClick={() => {
                setOpen(false);
                router.push("/settings");
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm notion-hover hover:bg-accent"
            >
              <Settings className="h-4 w-4" />
              Workspace settings
            </button>
            <button
              onClick={() => {
                setOpen(false);
                router.push("/settings?tab=members");
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm notion-hover hover:bg-accent"
            >
              <UserPlus className="h-4 w-4" />
              Invite people
            </button>
            <button
              onClick={() => {
                setOpen(false);
                router.push("/pricing");
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm notion-hover hover:bg-accent"
            >
              <CreditCard className="h-4 w-4" />
              {isOwner ? "Manage billing" : "Plans & pricing"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                router.push("/settings?tab=billing");
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm notion-hover hover:bg-accent"
            >
              <Building2 className="h-4 w-4" />
              Workspace overview
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
