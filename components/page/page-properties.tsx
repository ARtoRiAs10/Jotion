"use client";

import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Calendar, Check, Hash, Link2, Plus, Trash2, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const STATUS_COLORS: Record<string, string> = {
  "Not started": "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  "In progress": "bg-blue-200 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  Done: "bg-green-200 text-green-700 dark:bg-green-900 dark:text-green-200",
  Blocked: "bg-red-200 text-red-700 dark:bg-red-900 dark:text-red-200",
};

const DEFAULT_PROPERTIES = [
  { key: "status", name: "Status", type: "select", options: ["Not started", "In progress", "Done", "Blocked"] },
  { key: "tags", name: "Tags", type: "multi_select", options: [] },
  { key: "owner", name: "Owner", type: "person", options: [] },
  { key: "due", name: "Due", type: "date", options: [] },
];

const ADDABLE_PROPERTIES = [
  { key: "project", name: "Project", type: "text", icon: "#" },
  { key: "team", name: "Team", type: "text", icon: "#" },
  { key: "priority", name: "Priority", type: "select", options: ["Low", "Medium", "High"], icon: "#" },
  { key: "link", name: "Related page", type: "mention", options: [], icon: "↗" },
];

export const PageProperties = ({
  document,
}: {
  document: Doc<"documents">;
}) => {
  const setProperty = useMutation(api.documents.setProperty);
  const removeProperty = useMutation(api.documents.removeProperty);
  const properties = useQuery(api.documents.getProperties, {
    documentId: document._id,
  });
  const mentionable = useQuery(api.documents.getMentionablePages, {
    workspaceId: document.workspaceId as never,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const valueFor = (key: string) =>
    properties?.find((property) => property.key === key)?.value;

  const save = async (key: string, type: string, value: string) => {
    await setProperty({
      documentId: document._id,
      key,
      type,
      value: value || undefined,
    });
    setEditing(null);
  };

  const PropertyRow = ({
    property,
  }: {
    property: { key: string; name: string; type: string; options?: string[] };
  }) => {
    const value = valueFor(property.key);

    if (property.type === "select") {
      return (
        <div className="flex h-9 items-center gap-2 rounded px-2 hover:bg-accent">
          <span className="w-28 shrink-0 text-sm text-muted-foreground">
            {property.name}
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                role="button"
                className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-sm hover:bg-accent"
              >
                {value ? (
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      STATUS_COLORS[value] ?? "bg-accent text-foreground"
                    }`}
                  >
                    {value}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Empty</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
              {(property.options ?? []).map((option) => (
                <button
                  key={option}
                  role="button"
                  onClick={() => save(property.key, property.type, option)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      STATUS_COLORS[option]?.split(" ")[0] ?? "bg-muted-foreground"
                    }`}
                  />
                  {option}
                  {value === option && <Check className="ml-auto h-3.5 w-3.5" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      );
    }

    if (property.type === "multi_select") {
      const tags = value ? value.split(",").filter(Boolean) : [];
      return (
        <div className="flex h-9 items-center gap-2 rounded px-2 hover:bg-accent">
          <span className="w-28 shrink-0 text-sm text-muted-foreground">
            {property.name}
          </span>
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-accent px-1.5 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  role="button"
                  className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                >
                  + Add
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" align="start">
                <Input
                  autoFocus
                  placeholder="Type a tag and press enter"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && draft.trim()) {
                      const next = [...tags, draft.trim()];
                      save(property.key, property.type, next.join(","));
                      setDraft("");
                    }
                  }}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      );
    }

    if (property.type === "mention") {
      const mentioned = mentionable?.find((page) => page._id === value);
      return (
        <div className="flex h-9 items-center gap-2 rounded px-2 hover:bg-accent">
          <span className="w-28 shrink-0 text-sm text-muted-foreground">
            {property.name}
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                role="button"
                className="flex flex-1 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-sm hover:bg-accent"
              >
                {mentioned ? (
                  <>
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>
                      {mentioned.icon ? `${mentioned.icon} ` : ""}
                      {mentioned.title || "Untitled"}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {value ? "A linked page" : "Mention a page"}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1" align="start">
              {mentionable?.map((page) => (
                <button
                  key={page._id}
                  role="button"
                  onClick={() => save(property.key, property.type, page._id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span>{page.icon ?? "📄"}</span>
                  <span className="truncate">{page.title || "Untitled"}</span>
                  {value === page._id && (
                    <Check className="ml-auto h-3.5 w-3.5" />
                  )}
                </button>
              ))}
              {mentionable?.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No pages to mention yet.
                </p>
              )}
            </PopoverContent>
          </Popover>
        </div>
      );
    }

    if (editing === property.key) {
      return (
        <div className="flex h-9 items-center gap-2 rounded px-2 hover:bg-accent">
          <span className="w-28 shrink-0 text-sm text-muted-foreground">
            {property.name}
          </span>
          <Input
            autoFocus
            className="h-7"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => save(property.key, property.type, draft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save(property.key, property.type, draft);
              if (event.key === "Escape") setEditing(null);
            }}
          />
        </div>
      );
    }

    return (
      <div className="flex h-9 items-center gap-2 rounded px-2 hover:bg-accent">
        <span className="w-28 shrink-0 text-sm text-muted-foreground">
          {property.name}
        </span>
        <button
          role="button"
          onClick={() => {
            setEditing(property.key);
            setDraft(value ?? "");
          }}
          className="flex flex-1 items-center gap-1.5 text-left text-sm"
        >
          {property.type === "date" ? (
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          ) : property.type === "person" ? (
            <User className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className={value ? "" : "text-muted-foreground"}>
            {value || "Empty"}
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className="mt-4 space-y-0.5">
      {DEFAULT_PROPERTIES.map((property) => (
        <PropertyRow key={property.key} property={property} />
      ))}
      {properties
        ?.filter(
          (property) =>
            !DEFAULT_PROPERTIES.some((item) => item.key === property.key),
        )
        .map((property) => (
          <PropertyRow
            key={property._id}
            property={{
              key: property.key,
              name: property.key,
              type: property.type,
              options: property.options,
            }}
          />
        ))}
      {properties?.length ? (
        <Button
          variant="ghost"
          size="sm"
          className="ml-2 h-7 text-xs text-muted-foreground"
          onClick={() =>
            removeProperty({ documentId: document._id, key: "status" }).catch(
              () => toast.error("Cannot remove built-in properties"),
            )
          }
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Remove custom property
        </Button>
      ) : null}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 h-7 text-xs text-muted-foreground"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add property
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="start">
          {ADDABLE_PROPERTIES.map((item) => (
            <button
              key={item.key}
              role="button"
              onClick={() =>
                setProperty({
                  documentId: document._id,
                  key: item.key,
                  type: item.type,
                  options: item.options,
                }).catch((error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not add the property",
                  ),
                )
              }
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="text-muted-foreground">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
};
