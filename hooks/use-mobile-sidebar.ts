import { create } from "zustand";

type MobileSidebarStore = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useMobileSidebar = create<MobileSidebarStore>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));
