"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { useMutation, useQuery } from "convex/react";
import {
  Copy,
  FileText,
  Globe,
  Link2,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SidebarItem } from "./sidebar-item";
import { RenameDialog } from "./rename-dialog";

interface PageTreeProps {
  parentDocumentId?: string;
  level?: number;
}

export const PageTree = ({ parentDocumentId, level = 0 }: PageTreeProps) => {
  const { workspaceId } = useWorkspace();
  const params = useParams();
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  const documents = useQuery(api.documents.getSidebar, {
    parentDocument: parentDocumentId as never,
    workspaceId: workspaceId as never,
  });

  const create = useMutation(api.documents.create);
  const archive = useMutation(api.documents.archive);
  const duplicate = useMutation(api.documents.duplicate);
  const update = useMutation(api.documents.update);
  const move = useMutation(api.documents.move);
  const toggleFavorite = useMutation(api.documents.toggleFavorite);

  const onToggle = (documentId: string) =>
    setExpanded((previous) => ({
      ...previous,
      [documentId]: !previous[documentId],
    }));

  const onCreate = async (parentId?: string) => {
    const documentId = await create({
      title: "Untitled",
      parentDocument: parentId as never,
      workspaceId: workspaceId as never,
    });
    if (parentId) onToggle(parentId);
    router.push(`/documents/${documentId}`);
  };

  const onDuplicate = async (documentId: string) => {
    const newId = await duplicate({ id: documentId as never });
    toast.success("Page duplicated");
    router.push(`/documents/${newId}`);
  };

  const onArchive = async (documentId: string) => {
    await archive({ id: documentId as never });
    toast.success("Moved to trash");
  };

  const onRename = async (documentId: string, title: string) => {
    await update({ id: documentId as never, title });
  };

  const onDrop = async (documentId: string, parentId?: string) => {
    await move({
      id: documentId as never,
      parentDocument: parentId as never,
    });
    toast.success("Page moved");
  };

  if (documents === undefined) {
    return null;
  }

  if (documents.length === 0) {
    return null;
  }

  return (
    <>
      {documents.map((document) => (
        <div key={document._id}>
          <SidebarItem
            label={document.title || "Untitled"}
            emoji={document.icon}
            icon={document.type === "database" ? undefined : FileText}
            active={params.documentId === document._id}
            indent={level}
            expandable
            expanded={expanded[document._id]}
            onExpand={() => onToggle(document._id)}
            onClick={() => router.push(`/documents/${document._id}`)}
            draggable
            onDragStart={(event: React.DragEvent) => {
              event.dataTransfer.setData("text/jotion-page", document._id);
            }}
            onDrop={(event: React.DragEvent) => {
              event.preventDefault();
              const dragged = event.dataTransfer.getData("text/jotion-page");
              if (dragged) onDrop(dragged, document._id);
            }}
            actions={
              <>
                <button
                  role="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCreate(document._id);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <button
                      role="button"
                      className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="start" side="right">
                    <DropdownMenuItem onClick={() => onCreate(document._id)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add a sub-page
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        toggleFavorite({ id: document._id as never })
                      }
                    >
                      <Star className="mr-2 h-4 w-4" />
                      {document.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        setRenaming({ id: document._id, title: document.title })
                      }
                    >
                      <MoreHorizontal className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicate(document._id)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${window.location.origin}/documents/${document._id}`,
                        );
                        toast.success("Link copied");
                      }}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      Copy link
                    </DropdownMenuItem>
                    {document.isPublished && (
                      <DropdownMenuItem
                        onClick={() =>
                          router.push(`/preview/${document._id}`)
                        }
                      >
                        <Globe className="mr-2 h-4 w-4" />
                        Open published page
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => onArchive(document._id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Move to trash
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
          {expanded[document._id] && (
            <PageTree
              parentDocumentId={document._id}
              level={level + 1}
            />
          )}
        </div>
      ))}
      <RenameDialog
        open={Boolean(renaming)}
        title={renaming?.title ?? ""}
        onOpenChange={(open) => !open && setRenaming(null)}
        onSubmit={async (title) => {
          if (renaming) await onRename(renaming.id, title);
          setRenaming(null);
        }}
      />
    </>
  );
};
