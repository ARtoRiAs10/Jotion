"use client";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { FileArchive, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { buildImportTree } from "@/lib/notion-import";
import { readZip } from "@/lib/zip";

/**
 * Imports a Notion export (the ZIP file you get from *Settings → Export*).
 */
export const ImportNotionModal = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const importExport = useMutation(api.documents.importNotionExport);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const entries = await readZip(file);
      const tree = await buildImportTree(
        entries.map((entry) => ({
          path: entry.path,
          name: entry.name,
          read: entry.read,
        })),
      );

      if (tree.pages.length === 0 && tree.databases.length === 0) {
        toast.error(
          "No pages or databases were found in this export. Make sure you picked the ZIP file of the whole export.",
        );
        return;
      }

      const result = await importExport({
        workspaceId: workspaceId as never,
        pages: tree.pages.map((page) => ({
          title: page.title,
          content: page.content,
          children: page.children ?? [],
        })),
        databases: tree.databases.map((database) => ({
          title: database.title,
          columns: database.columns,
          rows: database.rows,
          children: database.children ?? [],
        })),
      });

      toast.success(
        `Imported ${result.pages} page${result.pages === 1 ? "" : "s"} and ${
          result.databases
        } database${result.databases === 1 ? "" : "s"}`,
      );
      onOpenChange(false);
      router.push("/documents");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import the export",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import from Notion</DialogTitle>
          <DialogDescription>
            In Notion open *Settings → Export → Export &amp; Import*, choose
            *Export* and upload the ZIP file here. Pages, sub-pages and databases
            are imported with their content.
          </DialogDescription>
        </DialogHeader>

        <div
          role="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) onFile(file);
          }}
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center notion-hover hover:bg-accent/40"
        >
          <FileArchive className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {busy ? "Reading the export…" : "Drop the ZIP file here"}
          </p>
          <p className="text-xs text-muted-foreground">
            or click to choose a file
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Choose file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
