"use client";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { useMobileSidebar } from "@/hooks/use-mobile-sidebar";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  ChevronsLeft,
  FileText,
  Home,
  LayoutTemplate,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ElementRef, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import { PageTree } from "./page-tree";
import { SidebarItem } from "./sidebar-item";
import { TrashPopover } from "./trash-popover";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

export const Sidebar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaceId, plan } = useWorkspace();
  const isMobile = useMediaQuery("max-width: 768px");
  const mobileOpen = useMobileSidebar((store) => store.open);
  const setMobileOpen = useMobileSidebar((store) => store.setOpen);

  const isResizingRef = useRef(false);
  const sidebarRef = useRef<ElementRef<"aside">>(null);
  const [isResetting, setIsResetting] = useState(false);

  const create = useMutation(api.documents.create);
  const createDatabase = useMutation(api.databases.createDatabase);

  const favorites = useQuery(api.documents.getFavorites, {
    workspaceId: workspaceId as never,
  });

  const notifications = useQuery(api.users.getNotifications, {});
  const unread = notifications?.filter((item) => !item.read).length ?? 0;

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    isResizingRef.current = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (event: globalThis.MouseEvent) => {
    if (!isResizingRef.current) return;
    let newWidth = event.clientX;
    if (newWidth < 220) newWidth = 220;
    if (newWidth < 480) newWidth = 480;
    if (sidebarRef.current) {
      sidebarRef.current.style.width = `${newWidth}px`;
    }
  };

  const handleMouseUp = () => {
    isResizingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  const resetWidth = () => {
    if (sidebarRef.current) {
      setIsResetting(true);
      sidebarRef.current.style.width = isMobile ? "100%" : "240px";
      setTimeout(() => setIsResetting(false), 300);
    }
  };

  const collapse = () => {
    if (sidebarRef.current) {
      setIsResetting(true);
      sidebarRef.current.style.width = "0";
      setTimeout(() => setIsResetting(false), 300);
    }
  };

  useEffect(() => {
    if (isMobile) collapse();
    else resetWidth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  const handleCreate = async () => {
    const documentId = await create({
      title: "Untitled",
      workspaceId: workspaceId as never,
    });
    router.push(`/documents/${documentId}`);
  };

  const handleCreateDatabase = async () => {
    const documentId = await createDatabase({
      workspaceId: workspaceId as never,
      name: "New database",
    });
    router.push(`/documents/${documentId}`);
  };

  return (
    <>
    {isMobile && mobileOpen && (
      <div
        role="button"
        onClick={() => setMobileOpen(false)}
        className="fixed inset-0 z-30 bg-black/40 md:hidden"
      />
    )}

    <aside
      ref={sidebarRef}
      className={cn(
        "group/sidebar relative z-40 flex h-full w-60 flex-col overflow-y-auto bg-secondary/60 thin-scrollbar",
        isResetting && "transition-all ease-in-out duration-300",
        isMobile &&
          cn(
            "fixed inset-y-0 left-0 w-64 transition-transform duration-200",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          ),
      )}
    >
      <div
        onClick={() => (isMobile ? setMobileOpen(false) : collapse())}
        role="button"
        className={cn(
          "absolute right-2 top-3 z-10 flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 notion-hover hover:bg-accent group-hover/sidebar:opacity-100",
          isMobile && "opacity-100",
        )}
      >
        <ChevronsLeft className="h-4 w-4" />
      </div>

      <WorkspaceSwitcher />

      <div className="px-1 pb-1">
        <SidebarItem
          label="Search"
          icon={Search}
          hint="⌘K"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("jotion:open-search"));
          }}
        />
        <SidebarItem
          label="Home"
          icon={Home}
          active={pathname === "/documents"}
          onClick={() => router.push("/documents")}
        />
        <SidebarItem
          label="Notifications"
          icon={Bell}
          badge={unread}
          active={pathname === "/notifications"}
          onClick={() => router.push("/notifications")}
        />
        <SidebarItem
          label="Settings & members"
          icon={Settings}
          onClick={() => router.push("/settings")}
        />
        <SidebarItem
          label="Templates"
          icon={LayoutTemplate}
          onClick={() => router.push("/templates")}
        />
      </div>

      <div className="mt-2 px-1">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Favorites
          </span>
          <button
            role="button"
            onClick={handleCreate}
            className="rounded p-0.5 text-muted-foreground notion-hover hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {favorites?.length ? (
          favorites.map((document) => (
            <SidebarItem
              key={document._id}
              label={document.title || "Untitled"}
              emoji={document.icon}
              indent={0}
              onClick={() => router.push(`/documents/${document._id}`)}
            />
          ))
        ) : (
          <p className="px-2 py-1 text-[12px] text-muted-foreground/70">
            Star a page to see it here.
          </p>
        )}
      </div>

      <div className="mt-3 flex-1 px-1">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Teamspace
          </span>
          <div className="flex items-center gap-0.5">
            <button
              role="button"
              title="New database"
              onClick={handleCreateDatabase}
              className="rounded p-0.5 text-muted-foreground notion-hover hover:bg-accent"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
            </button>
            <button
              role="button"
              title="New page"
              onClick={handleCreate}
              className="rounded p-0.5 text-muted-foreground notion-hover hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <PageTree />
        <SidebarItem
          label="Add a page"
          icon={Plus}
          onClick={handleCreate}
          className="mt-0.5"
        />
        <SidebarItem label="New database" icon={FileText} onClick={handleCreateDatabase} />
      </div>

      <div className="px-1 pb-1">
        <TrashPopover />
      </div>

      {plan.id === "free" && (
        <div className="mx-2 my-2 rounded-lg border bg-background/60 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Upgrade your plan
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Unlimited version history, guests and file uploads.
          </p>
          <button
            role="button"
            onClick={() => router.push("/pricing")}
            className="mt-2 w-full rounded-md bg-primary px-2 py-1.5 text-[13px] font-medium text-primary-foreground notion-hover hover:opacity-90"
          >
            See plans
          </button>
        </div>
      )}

      <div className="border-t p-2">
        <UserMenu />
      </div>

      <div
        onMouseDown={handleMouseDown}
        onClick={resetWidth}
        className="absolute right-0 top-0 h-full w-1 cursor-ew-resize bg-primary/0 transition group-hover/sidebar:bg-primary/10"
      />
    </aside>
    </>
  );
};
