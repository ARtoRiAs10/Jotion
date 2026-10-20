"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { AtSign, Check, MessageSquare, Send, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const CommentsPanel = ({
  documentId,
}: {
  documentId: Id<"documents">;
}) => {
  const comments = useQuery(api.comments.list, { documentId });
  const users = useQuery(api.users.listUsers, {});
  const add = useMutation(api.comments.add);
  const remove = useMutation(api.comments.remove);
  const toggleResolved = useMutation(api.comments.toggleResolved);

  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    if (!body.trim()) return;
    try {
      await add({
        documentId,
        body: body.trim(),
        mentions,
      });
      setBody("");
      setMentions([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to comment");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24">
      <div className="flex items-center gap-2 py-3 text-sm font-medium text-muted-foreground">
        <MessageSquare className="h-4 w-4" />
        {comments?.length ?? 0} comment{(comments?.length ?? 0) === 1 ? "" : "s"}
      </div>

      <div className="mb-6 rounded-lg border bg-background p-3">
        <Textarea
          ref={inputRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a comment… use @ to mention someone"
          className="min-h-[60px] resize-none border-0 focus-visible:ring-0"
        />
        <div className="mt-2 flex items-center gap-1">
          <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <AtSign className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1" align="start">
              <div className="max-h-60 overflow-y-auto thin-scrollbar">
                {users?.map((user) => (
                  <button
                    key={user._id}
                    role="button"
                    onClick={() => {
                      setMentions((previous) =>
                        previous.includes(user.clerkId)
                          ? previous
                          : [...previous, user.clerkId],
                      );
                      setBody((previous) => `${previous}@${user.name} `);
                      setMentionOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={user.avatarUrl} />
                    </Avatar>
                    {user.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {mentions.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {mentions.length} mention{mentions.length === 1 ? "" : "s"}
            </span>
          )}
          <Button
            size="sm"
            className="ml-auto h-7"
            disabled={!body.trim()}
            onClick={submit}
          >
            <Send className="mr-2 h-3.5 w-3.5" />
            Comment
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {comments?.map((comment) => (
          <div key={comment._id} className="flex gap-3">
            <Avatar className="h-7 w-7">
              <AvatarImage src={comment.authorAvatar} />
            </Avatar>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">
                  {comment.authorName ?? "Anonymous"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
                {comment.resolved && (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700 dark:bg-green-900 dark:text-green-200">
                    Resolved
                  </span>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{comment.body}</p>
              <div className="mt-1 flex items-center gap-3 text-[12px] text-muted-foreground">
                <button
                  role="button"
                  className="notion-hover hover:text-foreground"
                  onClick={() =>
                    toggleResolved({
                      id: comment._id,
                      resolved: !comment.resolved,
                    })
                  }
                >
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  {comment.resolved ? "Reopen" : "Resolve"}
                </button>
                <button
                  role="button"
                  className="notion-hover hover:text-foreground"
                  onClick={() => remove({ id: comment._id })}
                >
                  <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {comments?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No comments yet. Start the conversation above.
          </p>
        )}
      </div>
    </div>
  );
};
