"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { FileText, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-provider";

/**
 * The list of sub-pages of a page, exactly like Notion renders them at the
 * bottom of a page. Sub-pages can be created inline and opened like any
 * other page.
 */
export const SubPages = ({ documentId }: { documentId: Id<"documents"> }) => {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const [creating, setCreating] = useState(false);

  const children = useQuery(api.documents.getChildren, { documentId });
  const create = useMutation(api.documents.create);

  const onCreate = async () => {
    setCreating(true);
    try {
      const id = await create({
        title: "Untitled",
        parentDocument: documentId,
        workspaceId: workspaceId as never,
      });
      router.push(`/documents/${id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create the sub-page",
      );
    } finally {
      setCreating(false);
    }
  };

  if (!children?.length) return null;

  return (
    <div className="mt-10 border-t pt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Sub-pages
        </span>
        <button
          role="button"
          onClick={onCreate}
          disabled={creating}
          className="rounded p-0.5 text-muted-foreground notion-hover hover:bg-accent hover:text-foreground"
          title="New sub-page"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-0.5">
        {children.map((child) => (
          <button
            key={child._id}
            role="button"
            onClick={() => router.push(`/documents/${child._id}`)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm notion-hover hover:bg-accent"
          >
            <span className="text-[15px]">{child.icon ?? "📄"}</span>
            <span className="flex-1 truncate text-left">
              {child.title || "Untitled"}
            </span>
            <FileText className="h-3.5 w-3.5 text-muted-foreground opacity-0 notion-hover:opacity-100" />
          </button>
        ))}
        <button
          role="button"
          onClick={onCreate}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground notion-hover hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New sub-page</span>
        </button>
      </div>
    </div>
  );
};
