"use client";

import { TemplateGallery } from "@/components/templates/template-gallery";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { FileText, LayoutTemplate, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/clerk-react";
import { relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const DocumentsPage = () => {
  const router = useRouter();
  const { user } = useUser();
  const { workspaceId, plan } = useWorkspace();

  const create = useMutation(api.documents.create);
  const createDatabase = useMutation(api.databases.createDatabase);

  const recent = useQuery(api.documents.getRecent, {
    workspaceId: workspaceId as never,
    limit: 12,
  });

  const favorites = useQuery(api.documents.getFavorites, {
    workspaceId: workspaceId as never,
  });

  const onCreate = async () => {
    const documentId = await create({
      title: "Untitled",
      workspaceId: workspaceId as never,
    });
    router.push(`/documents/${documentId}`);
  };

  const onCreateDatabase = async () => {
    const documentId = await createDatabase({
      workspaceId: workspaceId as never,
      name: "New database",
    });
    router.push(`/documents/${documentId}`);
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {greeting()}, {user?.firstName ?? "there"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here is what is happening in your workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCreateDatabase}>
            <LayoutTemplate className="mr-2 h-4 w-4" />
            New database
          </Button>
          <Button size="sm" onClick={onCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New page
          </Button>
        </div>
      </div>

      {plan.id === "free" && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border bg-secondary/40 p-4">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              You are on the {plan.name} plan
            </p>
            <p className="text-xs text-muted-foreground">
              Upgrade for unlimited version history, unlimited guests and bigger
              uploads.
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <a href="/pricing">See plans</a>
          </Button>
        </div>
      )}

      {!!favorites?.length && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            Favorites
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {favorites.map((document) => (
              <button
                key={document._id}
                role="button"
                onClick={() => router.push(`/documents/${document._id}`)}
                className="flex items-center gap-2 rounded-lg border p-3 text-left text-sm notion-hover hover:bg-accent/50"
              >
                <span className="text-lg">{document.icon ?? "📄"}</span>
                <span className="truncate">{document.title || "Untitled"}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recent</h2>
        <div className="overflow-hidden rounded-lg border">
          {recent?.map((document) => (
            <button
              key={document._id}
              role="button"
              onClick={() => router.push(`/documents/${document._id}`)}
              className="flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 notion-hover hover:bg-accent/50"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">
                {document.icon ? `${document.icon} ` : ""}
                {document.title || "Untitled"}
              </span>
              <span className="text-xs text-muted-foreground">
                {relativeTime(document.lastEditedAt ?? document.createdAt ?? Date.now())}
              </span>
            </button>
          ))}
          {recent?.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
              <p className="text-sm font-medium">No pages yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first page and start writing.
              </p>
              <Button size="sm" onClick={onCreate}>
                <Plus className="mr-2 h-4 w-4" />
                New page
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Start from a template
        </h2>
        <TemplateGallery compact />
      </section>
    </div>
  );
};

export default DocumentsPage;
