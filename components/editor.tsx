"use client";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { useEdgeStore } from "@/lib/edgestore";
import { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import "@blocknote/core/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { requestUpgrade } from "@/lib/upgrade";
import { useCollaboration } from "@/hooks/use-collaboration";
import { AiAssistant } from "@/components/editor/ai-assistant";
import { Id } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/clerk-react";

interface EditorProps {
  onChange: (value: string) => void;
  initialContent?: string;
  editable?: boolean;
  /** Debounce interval for persisting changes (ms). */
  debounce?: number;
  /** When set, the page is edited collaboratively. */
  documentId?: Id<"documents">;
}

const Editor = ({
  onChange,
  initialContent,
  editable = true,
  debounce = 800,
  documentId,
}: EditorProps) => {
  const { resolvedTheme } = useTheme();
  const { edgestore } = useEdgeStore();
  const { plan } = useWorkspace();
  const { user } = useUser();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collaborative editing — the page is shared through a Yjs document that
  // is synced through Convex.
  const collaboration = useCollaboration(
    documentId,
    {
      name: user?.fullName ?? user?.firstName ?? "Anonymous",
      id: user?.id ?? "anonymous",
    },
  );

  const handleUpload = useCallback(
    async (file: File) => {
      const maxMb = plan.limits.fileUploadMb;
      if (
        Number.isFinite(maxMb) &&
        file.size > maxMb * 1024 * 1024
      ) {
        toast.error(
          `Your ${plan.name} plan supports uploads up to ${maxMb} MB. Upgrade for larger files.`,
        );
        requestUpgrade(
          `Your ${plan.name} plan supports uploads up to ${maxMb} MB per file.`,
          "uploads",
        );
        throw new Error("File too large");
      }
      try {
        const res = await edgestore.publicFiles.upload({ file });
        return res.url;
      } catch {
        // Fall back to the built-in local storage when Edge Store is not
        // configured on this deployment.
        const data = new FormData();
        data.append("file", file);
        const response = await fetch("/api/upload", { method: "POST", body: data });
        if (!response.ok) {
          throw new Error("Upload failed");
        }
        const result = (await response.json()) as { url: string };
        return result.url;
      }
    },
    [edgestore, plan],
  );

  const editor: BlockNoteEditor = useCreateBlockNote({
    initialContent:
      collaboration || !initialContent
        ? undefined
        : (JSON.parse(initialContent) as PartialBlock[]),
    uploadFile: handleUpload,
    ...(collaboration
      ? {
          collaboration: {
            fragment: collaboration.fragment,
            provider: collaboration.provider,
            user: {
              name: user?.fullName ?? "Anonymous",
              color: "#1B84E4",
            },
          },
        }
      : {}),
  } as never);

  // The first person to open a page seeds the collaborative document with
  // the content that is already stored on the page.
  useEffect(() => {
    if (!collaboration || !initialContent) return;
    if (collaboration.fragment.length > 0) return;

    try {
      const blocks = JSON.parse(initialContent) as PartialBlock[];
      if (blocks.length === 0) return;
      editor.replaceBlocks(editor.document, blocks);
    } catch {
      // A broken document is not worth crashing the editor for.
    }
  }, [collaboration, initialContent, editor]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleEditorChange = () => {
    const content = JSON.stringify(editor.document, null, 2);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(content), debounce);
  };

  return (
    <div>
      {editable && (
        <div className="mb-1 flex items-center justify-end">
          <AiAssistant editor={editor} onChange={onChange} />
        </div>
      )}
      <BlockNoteView
        editable={editable}
        editor={editor}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        onChange={handleEditorChange}
      />
    </div>
  );
};

export default Editor;
