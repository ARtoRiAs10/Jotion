"use client";

import { TemplateGallery } from "@/components/templates/template-gallery";
import { api } from "@/convex/_generated/api";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TemplatesPage = () => {
  const { workspaceId } = useWorkspace();
  const templates = useQuery(api.templates.list, {
    workspaceId: workspaceId as never,
  });
  const create = useMutation(api.templates.create);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const onCreate = async () => {
    if (!name.trim()) return;
    await create({
      workspaceId: workspaceId as never,
      name: name.trim(),
      description: description.trim() || undefined,
    });
    setName("");
    setDescription("");
    toast.success("Template created");
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Start from a template to move faster. Templates are shared with your
        whole workspace.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-2 rounded-lg border p-4">
        <div className="flex-1">
          <label className="text-xs font-medium">Name</label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Weekly report"
            className="mt-1"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium">Description</label>
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What is this template for?"
            className="mt-1"
          />
        </div>
        <Button onClick={onCreate} disabled={!name.trim()}>
          <Plus className="mr-2 h-4 w-4" />
          Add template
        </Button>
      </div>

      <div className="mt-6">
        <TemplateGallery />
      </div>

      {templates?.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Built-in templates are seeded automatically for every workspace.
        </p>
      )}
    </div>
  );
};

export default TemplatesPage;
