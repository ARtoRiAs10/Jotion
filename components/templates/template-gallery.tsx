"use client";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { LayoutTemplate } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export const TemplateGallery = ({ compact }: { compact?: boolean }) => {
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const templates = useQuery(api.templates.list, {
    workspaceId: workspaceId as never,
  });
  const createFromTemplate = useMutation(api.templates.createFromTemplate);

  const onUse = async (template: { _id: string; name: string }) => {
    try {
      const id = await createFromTemplate({
        templateId: template._id as never,
        workspaceId: workspaceId as never,
      });
      router.push(`/documents/${id}`);
      toast.success("Created from the template");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create the page",
      );
    }
  };

  if (!templates?.length) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No templates yet.
      </p>
    );
  }

  return (
    <div
      className={
        compact
          ? "grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
          : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {templates.map((template) => (
        <button
          key={template._id}
          role="button"
          onClick={() => onUse(template)}
          className="flex flex-col items-start gap-1 rounded-lg border p-4 text-left notion-hover hover:bg-accent/50"
        >
          <span className="text-2xl">{template.icon ?? "📄"}</span>
          <span className="text-sm font-medium">{template.name}</span>
          {template.description && (
            <span className="text-xs text-muted-foreground">
              {template.description}
            </span>
          )}
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <LayoutTemplate className="h-3 w-3" />
            {template.type === "database" ? "Database" : "Page"}
          </span>
        </button>
      ))}
    </div>
  );
};
