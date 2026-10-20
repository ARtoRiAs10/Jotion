"use client";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ChevronRight,
  Copy,
  Download,
  FileDown,
  FileUp,
  LayoutTemplate,
  Link2,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Share2,
  Star,
  Trash2,
  Unlock,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImportMarkdownModal } from "./import-markdown-modal";
import { ShareModal } from "./share-modal";

export const PageHeader = ({
  document,
  onOpenComments,
}: {
  document: Doc<"documents">;
  onOpenComments?: () => void;
}) => {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const ancestors = useQuery(api.documents.getAncestors, {
    documentId: document._id,
  });
  const comments = useQuery(api.comments.list, { documentId: document._id });
  const collaboration = useQuery(api.collaboration.get, {
    documentId: document._id,
  });

  const toggleFavorite = useMutation(api.documents.toggleFavorite);
  const duplicate = useMutation(api.documents.duplicate);
  const archive = useMutation(api.documents.archive);
  const lockPage = useMutation(api.documents.lockPage);
  const update = useMutation(api.documents.update);
  const saveAsTemplate = useMutation(api.templates.saveAsTemplate);
  const createSyncedCopy = useMutation(api.documents.createSyncedCopy);
  const setPublicAccess = useMutation(api.documents.setPublicAccess);

  const onDuplicate = async () => {
    const id = await duplicate({ id: document._id });
    toast.success("Page duplicated");
    router.push(`/documents/${id}`);
  };

  const onArchive = async () => {
    await archive({ id: document._id });
    toast.success("Moved to trash");
    router.push("/documents");
  };

  const onExport = () => {
    const content = document.content ? JSON.parse(document.content) : [];
    const text = content
      .map((block: { content?: { text?: string }[] }) =>
        (block.content ?? []).map((part) => part.text ?? "").join(""),
      )
      .join("\n\n");
    const blob = new Blob([`# ${document.title}\n\n${text}`], {
      type: "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${document.title || "page"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 bg-background/90 px-3 py-2 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-1 text-sm text-muted-foreground">
        <Link href="/documents" className="notion-hover hover:text-foreground">
          {workspace?.name ?? "Jotion"}
        </Link>
        {ancestors?.map((ancestor) => (
          <span key={ancestor._id} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <Link
              href={`/documents/${ancestor._id}`}
              className="notion-hover truncate hover:text-foreground"
            >
              {ancestor.icon ? `${ancestor.icon} ` : ""}
              {ancestor.title || "Untitled"}
            </Link>
          </span>
        ))}
        <span className="flex min-w-0 items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
          <span className="truncate text-foreground">
            {document.icon ? `${document.icon} ` : ""}
            {document.title || "Untitled"}
          </span>
          {document.isPrivate && (
            <span className="flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Lock className="h-3 w-3" />
              Private
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {collaboration?.presence && collaboration.presence.length > 1 && (
          <div className="mr-1 flex items-center">
            {collaboration.presence.slice(0, 3).map((person) => (
              <span
                key={person.clientId}
                title={`${person.name} is here`}
                className="-ml-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-[10px] font-medium text-white first:ml-0"
                style={{ backgroundColor: person.color }}
              >
                {person.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
            <span className="ml-2 text-[11px] text-muted-foreground">
              {collaboration.presence.length} editing
            </span>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground"
          onClick={onOpenComments}
        >
          <MessageSquare className="h-4 w-4" />
          {comments?.length ? (
            <span className="ml-1 text-xs">{comments.length}</span>
          ) : null}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground"
          onClick={() => toggleFavorite({ id: document._id })}
        >
          <Star
            className={`h-4 w-4 ${
              document.isFavorite ? "fill-amber-400 text-amber-400" : ""
            }`}
          />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground"
          onClick={() => setShareOpen(true)}
        >
          <Share2 className="h-4 w-4" />
          <span className="ml-1 hidden sm:inline">Share</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExport}>
              <Download className="mr-2 h-4 w-4" />
              Export as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setImportOpen(true)}>
              <FileUp className="mr-2 h-4 w-4" />
              Import from Markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                const id = await createSyncedCopy({
                  documentId: document._id,
                  workspaceId: document.workspaceId as never,
                });
                toast.success("Synced copy created");
                router.push(`/documents/${id}`);
              }}
            >
              <Link2 className="mr-2 h-4 w-4" />
              Create synced copy
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                await saveAsTemplate({
                  documentId: document._id,
                  workspaceId: document.workspaceId as never,
                });
                toast.success("Saved as a template");
              }}
            >
              <LayoutTemplate className="mr-2 h-4 w-4" />
              Save as template
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/documents/${document._id}`,
                );
                toast.success("Link copied");
              }}
            >
              <FileDown className="mr-2 h-4 w-4" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                try {
                  await update({
                    id: document._id,
                    isPrivate: !document.isPrivate,
                  });
                  toast.success(
                    document.isPrivate
                      ? "The page is now visible to the whole workspace"
                      : "The page is now private",
                  );
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not change the visibility",
                  );
                }
              }}
            >
              {document.isPrivate ? (
                <>
                  <Unlock className="mr-2 h-4 w-4" />
                  Make public
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Make private
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                lockPage({ id: document._id, isLocked: !document.isLocked })
              }
            >
              {document.isLocked ? (
                <>
                  <Unlock className="mr-2 h-4 w-4" />
                  Unlock page
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Lock page
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                setPublicAccess({
                  id: document._id,
                  publicAccess: document.isPublished ? "none" : "read",
                })
              }
            >
              <Share2 className="mr-2 h-4 w-4" />
              {document.isPublished ? "Unpublish" : "Publish to web"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onArchive}>
              <Trash2 className="mr-2 h-4 w-4" />
              Move to trash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ShareModal
        document={document}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />

      <ImportMarkdownModal
        open={importOpen}
        onOpenChange={setImportOpen}
        parentDocument={document._id}
      />
    </div>
  );
};
