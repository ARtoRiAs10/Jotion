"use client";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { AtSign, Bell, CheckCheck, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { relativeTime } from "@/lib/utils";

const ICONS = {
  mention: AtSign,
  comment: MessageSquare,
} as const;

const NotificationsPage = () => {
  const router = useRouter();
  const notifications = useQuery(api.users.getNotifications, {});
  const markRead = useMutation(api.users.markNotificationsRead);

  // Opening the inbox marks everything as read.
  useEffect(() => {
    if (notifications?.some((notification) => !notification.read)) {
      markRead({}).catch(() => undefined);
    }
  }, [notifications, markRead]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mentions and comments from your workspace.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => markRead({})}
        >
          <CheckCheck className="mr-2 h-4 w-4" />
          Mark all as read
        </Button>
      </div>

      <div className="mt-6 space-y-1">
        {notifications?.map((notification) => {
          const Icon =
            ICONS[notification.type as keyof typeof ICONS] ?? Bell;
          return (
            <button
              key={notification._id}
              role="button"
              onClick={() =>
                notification.documentId
                  ? router.push(`/documents/${notification.documentId}`)
                  : undefined
              }
              className="flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left text-sm notion-hover hover:bg-accent/40"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {notification.actorName ?? "Someone"}
                </span>{" "}
                <span className="text-muted-foreground">
                  {notification.type === "mention"
                    ? "mentioned you"
                    : "commented on a page"}
                </span>
                {notification.body && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {notification.body}
                  </span>
                )}
              </span>
              <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                {relativeTime(notification.createdAt)}
              </span>
            </button>
          );
        })}

        {notifications?.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-12 text-center">
            <Bell className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">You are all caught up</p>
            <p className="text-xs text-muted-foreground">
              Mentions and comments will show up here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
