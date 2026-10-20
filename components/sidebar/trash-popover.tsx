"use client";

import { ConfirmModal } from "@/components/modals/confirm-modal";
import { Spinner } from "@/components/spinner";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Search, Trash, Undo } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SidebarItem } from "./sidebar-item";

export const TrashPopover = () => {
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const params = useParams();
  const documents = useQuery(api.documents.getTrash, {
    workspaceId: workspaceId as never,
  });

  const restore = useMutation(api.documents.restore);
  const remove = useMutation(api.documents.remove);
  const [search, setSearch] = useState("");

  const filteredDocuments = documents?.filter((document) =>
    document.title.toLowerCase().includes(search.toLowerCase()),
  );

  const onRestore = async (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
    documentId: Id<"documents">,
  ) => {
    event.stopPropagation();
    const promise = restore({ id: documentId });
    toast.promise(promise, {
      loading: "Restoring page...",
      success: "Page restored",
      error: "Failed to restore page",
    });
  };

  const onRemove = async (documentId: Id<"documents">) => {
    const promise = remove({ id: documentId });
    toast.promise(promise, {
      loading: "Deleting page...",
      success: "Page deleted",
      error: "Failed to delete page",
    });
    await promise;
    if (params.documentId === documentId) router.push("/documents");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div>
          <SidebarItem label="Trash" icon={Trash} />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" side="right" align="start">
        <div className="text-sm">
          <div className="flex items-center gap-x-1 border-b p-2">
            <Search className="h-4 w-4" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-7 px-2 focus-visible:ring-transparent"
              placeholder="Filter by page title..."
            />
          </div>
          <div className="mt-2 max-h-80 overflow-y-auto px-1 pb-1 thin-scrollbar">
            {documents === undefined ? (
              <div className="flex h-full items-center justify-center p-4">
                <Spinner size="lg" />
              </div>
            ) : filteredDocuments?.length ? (
              filteredDocuments.map((document) => (
                <div
                  key={document._id}
                  role="button"
                  onClick={() => router.push(`/documents/${document._id}`)}
                  className="flex w-full items-center justify-between rounded-sm text-sm text-foreground notion-hover hover:bg-accent"
                >
                  <span className="truncate pl-2">{document.title || "Untitled"}</span>
                  <div className="flex items-center space-x-1">
                    <div
                      onClick={(event) => onRestore(event, document._id)}
                      role="button"
                      className="rounded-sm p-2 notion-hover hover:bg-accent"
                    >
                      <Undo className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <ConfirmModal onConfirm={() => onRemove(document._id)}>
                      <div
                        role="button"
                        className="rounded-sm p-2 notion-hover hover:bg-accent"
                      >
                        <Trash className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </ConfirmModal>
                  </div>
                </div>
              ))
            ) : (
              <p className="pb-2 text-center text-xs text-muted-foreground">
                No pages in the trash.
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
