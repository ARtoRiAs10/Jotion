"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { cn } from "@/lib/utils";
import { Check, Link2, Tag, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface DatabaseProperty {
  _id?: string;
  key: string;
  name: string;
  type: string;
  options?: string[];
}

const STATUS_COLORS: Record<string, string> = {
  "Not started": "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  "In progress": "bg-blue-200 text-blue-700 dark:bg-blue-900 dark:text-blue-200",
  Done: "bg-green-200 text-green-700 dark:bg-green-900 dark:text-green-200",
  Blocked: "bg-red-200 text-red-700 dark:bg-red-900 dark:text-red-200",
};

export const PropertyCell = ({
  property,
  value,
  onChange,
  className,
  readOnly,
}: {
  property: DatabaseProperty;
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  readOnly?: boolean;
}) => {
  const [draft, setDraft] = useState(value ?? "");

  const targetDatabaseId =
    property.type === "relation" ? property.options?.[0] : undefined;
  const target = useQuery(
    api.databases.getDatabase,
    targetDatabaseId
      ? { databaseId: targetDatabaseId as Id<"documents"> }
      : ("skip" as never),
  );

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  if (property.type === "rollup") {
    return (
      <div
        className={cn(
          "truncate px-2 py-1 text-sm italic text-muted-foreground",
          className,
        )}
      >
        {value || "—"}
      </div>
    );
  }

  if (property.type === "relation") {
    const linked = (value ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const rows = (target?.rows ?? []) as {
      row: { _id: string; title: string };
    }[];

    return (
      <div className={cn("px-1 py-1", className)}>
        <Popover>
          <PopoverTrigger asChild>
            <button
              role="button"
              className="flex min-h-[26px] w-full flex-wrap items-center gap-1 rounded px-1 text-left text-sm hover:bg-accent"
            >
              {linked.length === 0 && (
                <span className="text-muted-foreground">Empty</span>
              )}
              {linked.map((id) => {
                const row = rows.find((entry) => entry.row._id === id);
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-xs"
                  >
                    <Link2 className="h-3 w-3" />
                    {row?.row.title ?? "Linked row"}
                  </span>
                );
              })}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-1" align="start">
            {rows.map((entry) => {
              const isLinked = linked.includes(entry.row._id);
              return (
                <div
                  key={entry.row._id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <button
                    role="button"
                    onClick={() =>
                      onChange(
                        isLinked
                          ? linked
                              .filter((id) => id !== entry.row._id)
                              .join(",")
                          : [...linked, entry.row._id].join(","),
                      )
                    }
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5",
                        isLinked ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{entry.row.title}</span>
                  </button>
                  {isLinked && (
                    <button
                      role="button"
                      onClick={() =>
                        onChange(
                          linked
                            .filter((id) => id !== entry.row._id)
                            .join(","),
                        )
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                The related database is empty.
              </p>
            )}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  if (property.type === "formula") {
    return (
      <div className={cn("truncate px-2 py-1 text-sm italic text-muted-foreground", className)}>
        {value || "—"}
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className={cn("truncate px-2 py-1 text-sm", className)}>
        {property.type === "checkbox" ? (
          value === "true" ? (
            <Check className="h-4 w-4" />
          ) : null
        ) : property.type === "multi_select" ? (
          <span className="flex flex-wrap gap-1">
            {(value ?? "")
              .split(",")
              .filter(Boolean)
              .map((tag) => (
                <span key={tag} className="rounded bg-accent px-1.5 py-0.5 text-xs">
                  {tag}
                </span>
              ))}
          </span>
        ) : property.type === "select" && value ? (
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              STATUS_COLORS[value] ?? "bg-accent text-foreground"
            }`}
          >
            {value}
          </span>
        ) : (
          value
        )}
      </div>
    );
  }

  if (property.type === "select") {
    return (
      <Select
        className={cn("h-7 w-full border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0", className)}
        value={value ?? ""}
        onValueChange={onChange}
      >
        <option value="">—</option>
        {(property.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    );
  }

  if (property.type === "multi_select") {
    const tags = draft ? draft.split(",").filter(Boolean) : [];
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-1 px-2 py-1",
          className,
        )}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded bg-accent px-1.5 py-0.5 text-xs"
          >
            {tag}
          </span>
        ))}
        <Input
          className="h-6 w-24 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
          placeholder="+ tag"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => onChange(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onChange(draft);
          }}
        />
      </div>
    );
  }

  if (property.type === "checkbox") {
    return (
      <div className={cn("flex items-center justify-center px-2 py-1", className)}>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-neutral-300 accent-neutral-900 dark:accent-neutral-100"
          checked={value === "true"}
          onChange={(event) => onChange(String(event.target.checked))}
        />
      </div>
    );
  }

  if (property.type === "date") {
    return (
      <Input
        type="date"
        className={cn(
          "h-7 w-full border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0",
          className,
        )}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (property.type === "number") {
    return (
      <Input
        type="number"
        className={cn(
          "h-7 w-full border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0",
          className,
        )}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => onChange(draft)}
      />
    );
  }

  return (
    <Input
      className={cn(
        "h-7 w-full border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0",
        className,
      )}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onChange(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onChange(draft);
      }}
    />
  );
};

export const PropertyIcon = ({ type }: { type: string }) => {
  if (type === "multi_select") return <Tag className="h-3.5 w-3.5" />;
  if (type === "checkbox") return <Check className="h-3.5 w-3.5" />;
  return <span className="text-[11px] font-semibold">Aa</span>;
};
