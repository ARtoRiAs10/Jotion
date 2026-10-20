"use client";

import { api } from "@/convex/_generated/api";
import { useWorkspaceStore } from "@/hooks/use-workspace";
import { getPlan, PlanId, WorkspaceRole } from "@/lib/plans";
import { useMutation, useQuery } from "convex/react";
import { createContext, ReactNode, useContext, useEffect, useMemo } from "react";

type Workspace = {
  _id: string;
  name: string;
  icon?: string;
  plan?: string;
  billingCycle?: string;
  role: WorkspaceRole;
  isOwner: boolean;
  subscriptionStatus?: string;
};

interface WorkspaceContextValue {
  workspaces: Workspace[];
  workspace: Workspace | null;
  workspaceId?: string;
  role: WorkspaceRole;
  plan: ReturnType<typeof getPlan>;
  isOwner: boolean;
  setWorkspaceId: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const workspacesQuery = useQuery(api.workspaces.list, {});
  const workspaces = useMemo(() => workspacesQuery ?? [], [workspacesQuery]);
  const ensureDefault = useMutation(api.workspaces.ensureDefault);
  const seedTemplates = useMutation(api.templates.seedDefaults);
  const { workspaceId, setWorkspaceId } = useWorkspaceStore();

  // Make sure every user owns at least one workspace. We only do this once
  // the query has resolved, otherwise we would create duplicates.
  useEffect(() => {
    if (workspacesQuery && workspacesQuery.length === 0) {
      ensureDefault({});
    }
  }, [workspacesQuery, ensureDefault]);

  // Keep the selection valid.
  useEffect(() => {
    if (workspaces.length === 0) return;
    const exists = workspaces.some((workspace) => workspace._id === workspaceId);
    if (!exists) {
      setWorkspaceId(workspaces[0]._id);
    }
  }, [workspaces, workspaceId, setWorkspaceId]);

  // Seed the starter templates for the active workspace.
  useEffect(() => {
    if (!workspaceId) return;
    seedTemplates({ workspaceId: workspaceId as never });
  }, [workspaceId, seedTemplates]);

  const workspace =
    workspaces.find((item) => item._id === workspaceId) ?? workspaces[0] ?? null;

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces: workspaces as Workspace[],
      workspace,
      workspaceId: workspace?._id,
      role: workspace?.role ?? "member",
      plan: getPlan(workspace?.plan as PlanId),
      isOwner: workspace?.role === "owner",
      setWorkspaceId,
    }),
    [workspaces, workspace, setWorkspaceId],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    // Components rendered outside of the workspace shell (e.g. the public
    // preview) fall back to a sensible default.
    return {
      workspaces: [],
      workspace: null,
      workspaceId: undefined,
      role: "member" as WorkspaceRole,
      plan: getPlan("free"),
      isOwner: false,
      setWorkspaceId: () => undefined,
    };
  }
  return context;
};
