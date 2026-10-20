"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/utils";

/**
 * The comment thread of a published page. Visitors can comment without an
 * account when the page was published with the "Can comment" access.
 */
export const PublicComments = ({
  documentId,
  canComment,
}: {
  documentId: Id<"documents">;
  canComment: boolean;
}) => {
  const comments = useQuery(api.comments.list, { documentId });
  const addPublic = useMutation(api.comments.addPublic);

  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const publicComments = (comments ?? []).filter(
    (comment) => comment.isPublic,
  );

  const onSubmit = async () => {
    if (!name.trim() || !body.trim()) {
      toast.error("Please add your name and a comment");
      return;
    }
    setBusy(true);
    try {
      await addPublic({ documentId, name, body });
      setBody("");
      toast.success("Comment added");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add the comment",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!canComment && publicComments.length === 0) return null;

  return (
    <div className="mx-auto mt-12 w-full max-w-3xl border-t pt-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4" />
        Comments
        {publicComments.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground">
            {publicComments.length}
          </span>
        )}
      </h2>

      {canComment && (
        <div className="mt-4 space-y-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            className="h-9 max-w-xs"
          />
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write a comment…"
              className="min-h-[80px] flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button onClick={onSubmit} disabled={busy}>
              <Send className="mr-2 h-4 w-4" />
              Send
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Anyone with the link can comment on this page.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {publicComments.map((comment) => (
          <div
            key={comment._id}
            className="flex items-start gap-3 rounded-md border px-3 py-2.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-medium">
              {(comment.authorName ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{comment.authorName}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">
                  {relativeTime(comment.createdAt)}
                </span>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">
                {comment.body}
              </p>
            </div>
          </div>
        ))}
        {publicComments.length === 0 && canComment && (
          <p className="text-sm text-muted-foreground">
            No comments yet — be the first.
          </p>
        )}
      </div>
    </div>
  );
};
