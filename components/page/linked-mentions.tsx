"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * The "linked mentions" panel — the pages that reference this page through a
 * mention property.
 */
export const LinkedMentions = ({ documentId }: { documentId: Id<"documents"> }) => {
  const router = useRouter();
  const backlinks = useQuery(api.documents.getBacklinks, { documentId });

  if (!backlinks?.length) return null;

  return (
    <div className="mt-8 border-t pt-4">
      <div className="mb-2 flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Linked mentions
        </span>
      </div>
      <div className="space-y-0.5">
        {backlinks.map((page) => (
          <button
            key={`${page._id}-${page.propertyKey}`}
            role="button"
            onClick={() => router.push(`/documents/${page._id}`)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm notion-hover hover:bg-accent"
          >
            <span className="text-[15px]">{page.icon ?? "📄"}</span>
            <span className="flex-1 truncate text-left">
              {page.title || "Untitled"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
