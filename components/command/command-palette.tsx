"use client";

import { useWorkspace } from "@/components/providers/workspace-provider";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  Database,
  FileArchive,
  FileText,
  LayoutTemplate,
  Moon,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Trash,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ImportNotionModal } from "@/components/page/import-notion-modal";

export const CommandPalette = () => {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const documents = useQuery(api.documents.getSearch, {
    workspaceId: workspaceId as never,
    search,
  });
  const create = useMutation(api.documents.create);
  const createDatabase = useMutation(api.databases.createDatabase);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key.toLowerCase() === "p" && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key.toLowerCase() === "n" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        run(async () => {
          const id = await create({
            title: "Untitled",
            workspaceId: workspaceId as never,
          });
          router.push(`/documents/${id}`);
        });
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [create, router, workspaceId]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("jotion:open-search", handler);
    return () => window.removeEventListener("jotion:open-search", handler);
  }, []);

  const onSelect = (id: string) => {
    router.push(`/documents/${id}`);
    setOpen(false);
  };

  const run = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search pages or run a command…"
      />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() =>
              run(async () => {
                const id = await create({
                  title: "Untitled",
                  workspaceId: workspaceId as never,
                });
                router.push(`/documents/${id}`);
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            New page
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(async () => {
                const id = await createDatabase({
                  workspaceId: workspaceId as never,
                  name: "New database",
                });
                router.push(`/documents/${id}`);
              })
            }
          >
            <Database className="mr-2 h-4 w-4" />
            New database
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/templates"))}>
            <LayoutTemplate className="mr-2 h-4 w-4" />
            Browse templates
          </CommandItem>
          <CommandItem onSelect={() => run(() => setImportOpen(true))}>
            <FileArchive className="mr-2 h-4 w-4" />
            Import from Notion
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/notifications"))}>
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            Settings & members
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/pricing"))}>
            <Sparkles className="mr-2 h-4 w-4" />
            Plans & pricing
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
                toast.success("Theme updated");
              })
            }
          >
            {resolvedTheme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Toggle appearance
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/settings?tab=trash"))}>
            <Trash className="mr-2 h-4 w-4" />
            Open trash
          </CommandItem>
        </CommandGroup>

        {!!documents?.length && (
          <CommandGroup heading="Pages">
            {documents.slice(0, 12).map((document) => (
              <CommandItem
                key={document._id}
                value={`page-${document._id}-${document.title}`}
                onSelect={() => onSelect(document._id)}
              >
                {document.icon ? (
                  <span className="mr-2 text-[15px]">{document.icon}</span>
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                <span className="truncate">{document.title || "Untitled"}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>

    <ImportNotionModal open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
};
