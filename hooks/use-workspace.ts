import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WorkspaceSummary {
  _id: string;
  name: string;
  icon?: string;
  plan?: string;
  billingCycle?: string;
  role: "owner" | "admin" | "member" | "guest";
  isOwner: boolean;
  subscriptionStatus?: string;
}

type WorkspaceStore = {
  workspaceId?: string;
  setWorkspaceId: (id: string) => void;
};

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      workspaceId: undefined,
      setWorkspaceId: (id) => set({ workspaceId: id }),
    }),
    { name: "jotion-workspace" },
  ),
);
