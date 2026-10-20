"use client";

import { cn } from "@/lib/utils";
import { ChevronRight, LucideIcon, MoreHorizontal } from "lucide-react";

interface SidebarItemProps {
  label: string;
  icon?: LucideIcon;
  emoji?: string;
  active?: boolean;
  indent?: number;
  expandable?: boolean;
  expanded?: boolean;
  onExpand?: () => void;
  onClick?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
  onDragOver?: (event: React.DragEvent) => void;
  onDrop?: (event: React.DragEvent) => void;
  actions?: React.ReactNode;
  hint?: string;
  badge?: number;
  className?: string;
}

export const SidebarItem = ({
  label,
  icon: Icon,
  emoji,
  active,
  indent = 0,
  expandable,
  expanded,
  onExpand,
  onClick,
  onContextMenu,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  actions,
  hint,
  badge,
  className,
}: SidebarItemProps) => {
  return (
    <div
      role="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{ paddingLeft: `${indent * 14 + 6}px` }}
      className={cn(
        "group/sidebar-item flex h-[28px] w-full cursor-pointer items-center gap-1.5 rounded-md pr-2 text-sm text-muted-foreground notion-hover hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground font-medium",
        className,
      )}
    >
      {expandable ? (
        <div
          role="button"
          onClick={(event) => {
            event.stopPropagation();
            onExpand?.();
          }}
          className="flex h-full w-4 shrink-0 items-center justify-center rounded hover:bg-accent"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/70 transition-transform",
              expanded && "rotate-90",
            )}
          />
        </div>
      ) : (
        <div className="w-4 shrink-0" />
      )}

      {emoji ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[15px]">
          {emoji}
        </span>
      ) : Icon ? (
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : null}

      <span className="truncate text-[14px]">{label}</span>

      {typeof badge === "number" && badge > 0 && (
        <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background">
          {badge > 99 ? "99+" : badge}
        </span>
      )}

      {hint && (
        <kbd className="ml-auto hidden shrink-0 rounded border bg-muted px-1.5 font-sans text-[10px] font-medium text-muted-foreground group-hover/sidebar-item:inline-block">
          {hint}
        </kbd>
      )}

      {actions && (
        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover/sidebar-item:opacity-100">
          {actions}
        </div>
      )}

      {onContextMenu && (
        <div
          role="button"
          onClick={(event) => {
            event.stopPropagation();
            onContextMenu(event);
          }}
          className="ml-auto flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
};
