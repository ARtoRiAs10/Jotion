"use client";

import { Banner } from "@/app/(main)/_components/banner";
import { Cover } from "@/components/cover";
import { DatabaseView } from "@/components/database/database-view";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";

import { CommentsPanel } from "@/components/page/comments-panel";
import { LinkedMentions } from "@/components/page/linked-mentions";
import { PageHeader } from "@/components/page/page-header";
import { PageProperties } from "@/components/page/page-properties";
import { PageTitle } from "@/components/page/page-title";
import { SubPages } from "@/components/page/sub-pages";
import { SyncedContent } from "@/components/page/synced-content";
import { VersionsPanel } from "@/components/page/versions-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

interface DocumentIdPageProps {
  params: {
    documentId: Id<"documents">;
  };
}

type Tab = "content" | "comments" | "versions";

const DocumentIdPage = ({ params }: DocumentIdPageProps) => {
  const Editor = useMemo(
    () => dynamic(() => import("@/components/editor"), { ssr: false }),
    [],
  );

  const [tab, setTab] = useState<Tab>("content");

  const document = useQuery(api.documents.getById, {
    documentId: params.documentId,
  });
  const permission = useQuery(api.documents.getMyPermission, {
    documentId: params.documentId,
  });

  const update = useMutation(api.documents.update);
  // The `updatedAt` the editor loaded — used to detect a conflicting edit.
  const baseUpdatedAt = useRef<number | undefined>(undefined);

  const onChange = async (content: string) => {
    try {
      const updated = await update({
        id: params.documentId,
        content,
        baseUpdatedAt: baseUpdatedAt.current,
      });
      if (updated && typeof updated === "object" && "updatedAt" in updated) {
        baseUpdatedAt.current = (updated as { updatedAt?: number }).updatedAt;
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save the page",
      );
    }
  };

  if (document === undefined) {
    return (
      <div>
        <Cover.Skeleton />
        <div className="mx-auto mt-10 md:max-w-3xl lg:max-w-4xl">
          <div className="space-y-4 pl-8 pt-4">
            <Skeleton className="h-14 w-[50%]" />
            <Skeleton className="h-14 w-[80%]" />
            <Skeleton className="h-14 w-[40%]" />
            <Skeleton className="h-14 w-[60%]" />
          </div>
        </div>
      </div>
    );
  }

  if (document === null) {
    return <div>Not found</div>;
  }

  if (baseUpdatedAt.current === undefined && document.updatedAt) {
    baseUpdatedAt.current = document.updatedAt;
  }

  const isDatabase = document.type === "database";
  const canEdit = permission === undefined || permission === "owner" || permission === "edit";
  const editable = !document.isLocked && canEdit;

  const tabs: { id: Tab; label: string }[] = [
    { id: "content", label: isDatabase ? "Database" : "Content" },
    { id: "comments", label: "Comments" },
    { id: "versions", label: "History" },
  ];

  return (
    <div className="pb-40">
      <PageHeader
        document={document}
        onOpenComments={() => setTab("comments")}
      />

      {document.isArchived && <Banner documentId={document._id} />}
      <Cover url={document.coverImage} />

      <div
        className={`mx-auto px-4 ${
          isDatabase ? "max-w-6xl" : "md:max-w-3xl lg:max-w-4xl"
        }`}
      >
        <div className="mt-8">
          <PageTitle initialData={document} />
          <PageProperties document={document} />
        </div>

        <div className="mt-6 flex items-center gap-1 border-b text-sm">
          {tabs.map((item) => (
            <button
              key={item.id}
              role="button"
              onClick={() => setTab(item.id)}
              className={`-mb-px border-b-2 px-3 py-2 notion-hover ${
                tab === item.id
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "content" && (
          <div className="pt-4">
            {isDatabase ? (
              <DatabaseView databaseId={document._id} />
            ) : (
              <Editor
                editable={editable}
                onChange={onChange}
                initialContent={document.content}
                documentId={document._id}
              />
            )}
          </div>
        )}

        {tab === "content" && !isDatabase && (
          <>
            <SyncedContent documentId={document._id} />
            <SubPages documentId={document._id} />
            <LinkedMentions documentId={document._id} />
          </>
        )}

        {tab === "comments" && <CommentsPanel documentId={document._id} />}

        {tab === "versions" && <VersionsPanel documentId={document._id} />}
      </div>
    </div>
  );
};

export default DocumentIdPage;
