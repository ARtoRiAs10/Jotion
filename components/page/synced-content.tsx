"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * The content of a synced page — it mirrors another page and updates
 * automatically.
 */
export const SyncedContent = ({
  documentId,
}: {
  documentId: Id<"documents">;
}) => {
  const router = useRouter();
  const Editor = useMemo(
    () => dynamic(() => import("@/components/editor"), { ssr: false }),
    [],
  );

  const source = useQuery(api.documents.getSyncedSource, { documentId });

  if (!source) return null;

  return (
    <div className="mt-6 rounded-lg border bg-secondary/30 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Synced from
        </span>
        <button
          role="button"
          onClick={() => router.push(`/documents/${source._id}`)}
          className="text-sm font-medium notion-hover hover:underline"
        >
          {source.icon ? `${source.icon} ` : ""}
          {source.title || "Untitled"}
        </button>
      </div>
      <Editor
        editable={false}
        onChange={() => undefined}
        initialContent={source.content}
      />
    </div>
  );
};
