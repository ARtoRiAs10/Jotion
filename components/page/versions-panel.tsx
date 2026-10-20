"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const VersionsPanel = ({
  documentId,
}: {
  documentId: Id<"documents">;
}) => {
  const versions = useQuery(api.versions.list, { documentId });
  const restore = useMutation(api.versions.restore);
  const remove = useMutation(api.versions.remove);
  const create = useMutation(api.versions.create);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24">
      <div className="flex items-center gap-2 py-3">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          Page history
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 text-xs"
          onClick={async () => {
            await create({ documentId });
            toast.success("Snapshot created");
          }}
        >
          Create a snapshot
        </Button>
      </div>

      <div className="space-y-1">
        {versions?.map((version) => (
          <div
            key={version._id}
            className="flex items-center gap-3 rounded-md px-2 py-2 notion-hover hover:bg-accent"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded bg-accent text-xs">
              {new Date(version.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {version.label ?? version.title}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {version.createdByName ?? "Someone"} ·{" "}
                {new Date(version.createdAt).toLocaleString()}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={async () => {
                await restore({ versionId: version._id });
                toast.success("Version restored");
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Restore
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground"
              onClick={() => remove({ versionId: version._id })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {versions?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No version history yet. Versions are captured automatically as you
            edit.
          </p>
        )}
      </div>
    </div>
  );
};
