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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const SAMPLE = `# Imported page

Paste or drop any **Markdown** here.

- Lists work
- [x] So do to-do items
- [ ] And code blocks
`;

export const ImportMarkdownModal = ({
  open,
  onOpenChange,
  parentDocument,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the page is created as a sub-page. */
  parentDocument?: Id<"documents">;
}) => {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const importMarkdown = useMutation(api.documents.importMarkdown);

  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);

  const onImport = async () => {
    if (!markdown.trim()) {
      toast.error("Paste some Markdown first");
      return;
    }
    setBusy(true);
    try {
      const id = await importMarkdown({
        workspaceId: workspaceId as never,
        parentDocument,
        title: title.trim() || undefined,
        markdown,
      });
      onOpenChange(false);
      setMarkdown("");
      setTitle("");
      toast.success("Markdown imported");
      router.push(`/documents/${id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import the page",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from Markdown</DialogTitle>
          <DialogDescription>
            Headings, lists, to-dos, quotes, code blocks and dividers are
            converted into blocks. The first heading becomes the page title.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="import-title">Title (optional)</Label>
            <Input
              id="import-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Taken from the first heading"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="import-markdown">Markdown</Label>
            <Textarea
              id="import-markdown"
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              placeholder={SAMPLE}
              className="min-h-[280px] font-mono text-xs"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMarkdown(SAMPLE)}
          >
            Insert an example
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onImport} disabled={busy}>
            <FileUp className="mr-2 h-4 w-4" />
            {busy ? "Importing…" : "Import page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
