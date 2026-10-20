"use client";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarDays,
  ChevronDown,
  Columns3,
  Download,
  List,
  MoreHorizontal,
  Plus,
  Rows3,
  Settings2,
  Table2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RenameDialog } from "@/components/sidebar/rename-dialog";
import { DatabaseProperty, PropertyCell } from "./property-cell";
import { AutomationsPanel } from "./automations-panel";
import { PermissionsPanel } from "./permissions-panel";
import { PropertyEditor } from "./property-editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const VIEW_TYPES = [
  { type: "table", label: "Table", icon: Table2 },
  { type: "board", label: "Board", icon: Columns3 },
  { type: "list", label: "List", icon: List },
  { type: "gallery", label: "Gallery", icon: Rows3 },
  { type: "calendar", label: "Calendar", icon: CalendarDays },
];

interface Row {
  row: { _id: Id<"documents">; title: string; icon?: string; coverImage?: string };
  props: { key: string; value?: string; type: string; options?: string[] }[];
}

const SORT_OPERATORS = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "is" },
  { value: "not_contains", label: "does not contain" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
  { value: "checked", label: "is checked" },
  { value: "unchecked", label: "is unchecked" },
];

interface SortRule {
  key: string;
  direction: "asc" | "desc";
}

interface FilterRule {
  key: string;
  operator: string;
  value?: string;
}

const matchesFilter = (value: string | undefined, rule: FilterRule) => {
  const actual = (value ?? "").toLowerCase();
  const expected = (rule.value ?? "").toLowerCase();
  switch (rule.operator) {
    case "contains":
      return actual.includes(expected);
    case "equals":
      return actual === expected;
    case "not_contains":
      return !actual.includes(expected);
    case "is_empty":
      return actual === "";
    case "is_not_empty":
      return actual !== "";
    case "checked":
      return actual === "true";
    case "unchecked":
      return actual !== "true";
    default:
      return true;
  }
};

export const DatabaseView = ({ databaseId }: { databaseId: Id<"documents"> }) => {
  const data = useQuery(api.databases.getDatabase, { databaseId });
  const createRow = useMutation(api.databases.createRow);
  const deleteRow = useMutation(api.databases.deleteRow);
  const setRowValue = useMutation(api.databases.setRowValue);
  const update = useMutation(api.documents.update);
  const addView = useMutation(api.databases.addView);
  const removeView = useMutation(api.databases.removeView);
  const updateView = useMutation(api.databases.updateView);
  const importRows = useMutation(api.databases.importRows);

  const [activeViewId, setActiveViewId] = useState<Id<"views"> | undefined>();
  const [renaming, setRenaming] = useState<{ id: Id<"documents">; title: string } | null>(null);
  const [editingProperty, setEditingProperty] = useState<
    (typeof properties)[number] | undefined
  >();
  const [importOpen, setImportOpen] = useState(false);
  const [newPropertyOpen, setNewPropertyOpen] = useState(false);
  const [csv, setCsv] = useState("");

  const views = useMemo(() => data?.views ?? [], [data?.views]);
  const activeView =
    views.find((view) => view._id === activeViewId) ?? views[0] ?? undefined;
  const properties = useMemo(() => data?.properties ?? [], [data?.properties]);
  const databaseTitle = data?.database?.title as string | undefined;
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);

  const valuesFor = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const entry of rows as Row[]) {
      map[entry.row._id] = {};
      for (const property of entry.props) {
        map[entry.row._id][property.key] = property.value ?? "";
      }
    }
    return map;
  }, [rows]);

  const onAddRow = async () => {
    await createRow({ databaseId, title: "Untitled" });
  };

  const onAddView = async (type: string) => {
    const label = VIEW_TYPES.find((item) => item.type === type)?.label ?? "View";
    const view = await addView({
      databaseId,
      name: `${label} ${views.length + 1}`,
      type,
    });
    setActiveViewId(view);
  };

  const setValue = async (
    rowId: Id<"documents">,
    property: DatabaseProperty,
    value: string,
  ) => {
    await setRowValue({
      documentId: rowId,
      key: property.key,
      type: property.type,
      value: value || undefined,
    });
  };

  const groupProperty = properties.find(
    (property) => property.key === activeView?.groupBy,
  );

  const viewType = activeView?.type ?? "table";

  const sorts = useMemo(
    () => (activeView?.sorts ?? []) as SortRule[],
    [activeView?.sorts],
  );
  const filters = useMemo(
    () => (activeView?.filters ?? []) as FilterRule[],
    [activeView?.filters],
  );

  const visibleRows = useMemo(() => {
    let result = rows as Row[];

    if (filters.length) {
      result = result.filter((entry) =>
        filters.every((rule) =>
          matchesFilter(
            entry.props.find((prop) => prop.key === rule.key)?.value,
            rule,
          ),
        ),
      );
    }

    if (sorts.length) {
      result = [...result].sort((a, b) => {
        for (const rule of sorts) {
          const left =
            a.props.find((prop) => prop.key === rule.key)?.value ?? "";
          const right =
            b.props.find((prop) => prop.key === rule.key)?.value ?? "";
          const numeric = Number(left);
          const numericRight = Number(right);
          let comparison = 0;
          if (left !== "" && right !== "" && !Number.isNaN(numeric) && !Number.isNaN(numericRight)) {
            comparison = numeric - numericRight;
          } else {
            comparison = left.localeCompare(right, undefined, {
              numeric: true,
              sensitivity: "base",
            });
          }
          if (comparison !== 0) {
            return rule.direction === "desc" ? -comparison : comparison;
          }
        }
        return 0;
      });
    }

    return result;
  }, [rows, filters, sorts]);

  const updateViewConfig = async (patch: {
    sorts?: SortRule[];
    filters?: FilterRule[];
  }) => {
    if (!activeView) return;
    await updateView({
      viewId: activeView._id,
      sorts: patch.sorts ?? sorts,
      filters: patch.filters ?? filters,
    });
  };

  if (data === undefined) {
    return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  }

  const onExportCsv = () => {
    const header = ["Name", ...properties.map((property) => property.name)];
    const escape = (value: string) =>
      /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    const lines = [header.map(escape).join(",")];
    for (const entry of visibleRows as Row[]) {
      const values = properties.map((property) => {
        const value =
          entry.props.find((prop) => prop.key === property.key)?.value ?? "";
        return escape(value);
      });
      lines.push([escape(entry.row.title), ...values].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${databaseTitle || "database"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onImportCsv = async () => {
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      toast.error("Paste a CSV with a header row and at least one row");
      return;
    }
    const parseLine = (line: string) => {
      const cells: string[] = [];
      let current = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
          if (quoted && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            quoted = !quoted;
          }
        } else if (char === "," && !quoted) {
          cells.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      cells.push(current.trim());
      return cells;
    };

    const header = parseLine(lines[0]);
    const rows = lines.slice(1).map((line) => {
      const cells = parseLine(line);
      const values: Record<string, string> = {};
      header.forEach((name, index) => {
        if (index === 0) return;
        if (!name) return;
        values[name] = cells[index] ?? "";
      });
      return { title: cells[0] ?? "Untitled", values };
    });

    try {
      const count = await importRows({ databaseId, rows });
      setImportOpen(false);
      setCsv("");
      toast.success(`Imported ${count} row${count === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import the rows",
      );
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24">
      <div className="mb-3 flex items-center gap-1 overflow-x-auto thin-scrollbar">
        {views.map((view) => (
          <div key={view._id} className="group relative flex items-center">
            <button
              role="button"
              onClick={() => setActiveViewId(view._id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-1.5 text-sm ${
                view._id === activeView?._id
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground notion-hover hover:bg-accent/60"
              }`}
            >
              {view.name}
            </button>
          </div>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {VIEW_TYPES.map((item) => (
              <DropdownMenuItem key={item.type} onClick={() => onAddView(item.type)}>
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {viewType === "board" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                Group by: {groupProperty?.name ?? "None"}
                <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {properties
                .filter((property) => property.type === "select")
                .map((property) => (
                  <DropdownMenuItem
                    key={property._id}
                    onClick={() =>
                      activeView &&
                      updateView({
                        viewId: activeView._id,
                        groupBy: property.key,
                      })
                    }
                  >
                    {property.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <span>
          {visibleRows.length} item{visibleRows.length === 1 ? "" : "s"}
          {filters.length > 0 ? ` (filtered from ${rows.length})` : ""}
        </span>

        {activeView && (
          <>
            {/* ------------------------------------------- */}
            {/*  Sort                                       */}
            {/* ------------------------------------------- */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  Sort
                  {sorts.length > 0 && (
                    <span className="ml-1.5 rounded bg-accent px-1 text-[10px]">
                      {sorts.length}
                    </span>
                  )}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => updateViewConfig({ sorts: [] })}>
                  Clear sorting
                </DropdownMenuItem>
                {properties.map((property) => (
                  <DropdownMenuItem
                    key={property._id}
                    onClick={() =>
                      updateViewConfig({
                        sorts: [
                          {
                            key: property.key,
                            direction:
                              sorts[0]?.key === property.key &&
                              sorts[0]?.direction === "asc"
                                ? "desc"
                                : "asc",
                          },
                        ],
                      })
                    }
                  >
                    {property.name}
                    {sorts[0]?.key === property.key && (
                      <span className="ml-auto text-[10px] uppercase">
                        {sorts[0].direction}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* ------------------------------------------- */}
            {/*  Filter                                     */}
            {/* ------------------------------------------- */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  Filter
                  {viewType === "table" && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <AutomationsPanel
            databaseId={databaseId}
            properties={properties.map((property) => ({
              key: property.key,
              name: property.name,
              type: property.type,
            }))}
          />
          <PermissionsPanel
            databaseId={databaseId}
            currentPermission={(data as { permission?: string }).permission}
          />
        </div>
      )}

      {filters.length > 0 && (
                    <span className="ml-1.5 rounded bg-accent px-1 text-[10px]">
                      {filters.length}
                    </span>
                  )}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem onClick={() => updateViewConfig({ filters: [] })}>
                  Clear filters
                </DropdownMenuItem>
                {properties.map((property) => (
                  <DropdownMenuItem
                    key={property._id}
                    onClick={() =>
                      updateViewConfig({
                        filters: [
                          {
                            key: property.key,
                            operator:
                              property.type === "checkbox"
                                ? "checked"
                                : "contains",
                            value: "",
                          },
                        ],
                      })
                    }
                  >
                    {property.name}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {property.type === "checkbox" ? "is checked" : "contains"}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {activeView && views.length > 1 && (
          <button
            role="button"
            className="notion-hover hover:text-foreground"
            onClick={async () => {
              await removeView({ viewId: activeView._id });
              setActiveViewId(undefined);
            }}
          >
            Delete view
          </button>
        )}
      </div>

      {viewType === "table" && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <AutomationsPanel
            databaseId={databaseId}
            properties={properties.map((property) => ({
              key: property.key,
              name: property.name,
              type: property.type,
            }))}
          />
          <PermissionsPanel
            databaseId={databaseId}
            currentPermission={(data as { permission?: string }).permission}
          />
        </div>
      )}

      {filters.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {filters.map((rule, index) => {
            const property = properties.find(
              (item) => item.key === rule.key,
            );
            const needsValue = ![
              "is_empty",
              "is_not_empty",
              "checked",
              "unchecked",
            ].includes(rule.operator);
            return (
              <div
                key={`${rule.key}-${index}`}
                className="flex items-center gap-1.5 rounded-md border bg-accent/40 px-2 py-1 text-xs"
              >
                <span className="font-medium">{property?.name ?? rule.key}</span>
                <span className="text-muted-foreground">
                  {SORT_OPERATORS.find(
                    (operator) => operator.value === rule.operator,
                  )?.label ?? rule.operator}
                </span>
                {needsValue && (
                  <input
                    className="w-24 bg-transparent outline-none"
                    defaultValue={rule.value ?? ""}
                    placeholder="value"
                    onBlur={(event) =>
                      updateViewConfig({
                        filters: filters.map((item, position) =>
                          position === index
                            ? { ...item, value: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                )}
                <button
                  role="button"
                  onClick={() =>
                    updateViewConfig({
                      filters: filters.filter((_, position) => position !== index),
                    })
                  }
                  className="text-muted-foreground notion-hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {viewType === "table" && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-secondary/60">
                <th className="w-8" />
                <th className="min-w-[220px] border-b px-3 py-2 text-left font-medium">
                  Name
                </th>
                {properties.map((property) => (
                  <th
                    key={property._id}
                    className="group/property min-w-[140px] border-b px-3 py-2 text-left font-medium"
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate">{property.name}</span>
                      <button
                        role="button"
                        onClick={() => setEditingProperty(property)}
                        className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 notion-hover:opacity-100 group-hover/property:opacity-100"
                        title="Edit property"
                      >
                        <Settings2 className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="w-10 border-b" />
              </tr>
            </thead>
            <tbody>
              {(visibleRows as Row[]).map(({ row }) => (
                <tr key={row._id} className="group/row notion-hover hover:bg-accent/40">
                  <td className="border-b px-2 py-1" />
                  <td className="border-b px-3 py-1">
                    <div className="flex items-center gap-1">
                      <span>{row.icon}</span>
                      <input
                        className="w-full bg-transparent text-sm outline-none"
                        defaultValue={row.title}
                        onBlur={(event) =>
                          update({
                            id: row._id,
                            title: event.target.value || "Untitled",
                          })
                        }
                      />
                    </div>
                  </td>
                  {properties.map((property) => (
                    <td key={property._id} className="border-b px-0 py-0">
                      <PropertyCell
                        property={property}
                        value={valuesFor[row._id]?.[property.key]}
                        onChange={(value) => setValue(row._id, property, value)}
                      />
                    </td>
                  ))}
                  <td className="border-b px-1 py-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover/row:opacity-100"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            setRenaming({ id: row._id, title: row.title })
                          }
                        >
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={async () => {
                            await deleteRow({ documentId: row._id });
                            toast.success("Row deleted");
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete row
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-2 p-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAddRow}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New row
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setNewPropertyOpen(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New property
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onExportCsv}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>
      )}

      {viewType === "board" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {(groupProperty?.options ?? ["Ungrouped"]).map((group) => {
            const groupRows = (visibleRows as Row[]).filter((entry) => {
              if (!groupProperty) return true;
              const value = valuesFor[entry.row._id]?.[groupProperty.key];
              return group === "Ungrouped" ? !value : value === group;
            });
            return (
              <div
                key={group}
                className="w-64 shrink-0 rounded-lg bg-secondary/50 p-2"
              >
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className="text-sm font-medium">{group}</span>
                  <span className="text-xs text-muted-foreground">
                    {groupRows.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {groupRows.map(({ row }) => (
                    <div
                      key={row._id}
                      className="rounded-md border bg-background p-3 text-sm notion-hover hover:bg-accent/40"
                    >
                      <div className="flex items-center gap-1">
                        <span>{row.icon}</span>
                        <span className="truncate">{row.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="w-64 shrink-0">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAddRow}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New row
            </Button>
          </div>
        </div>
      )}

      {viewType === "list" && (
        <div className="space-y-1">
          {(visibleRows as Row[]).map(({ row }) => (
            <div
              key={row._id}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm notion-hover hover:bg-accent"
            >
              <span>{row.icon}</span>
              <span className="flex-1 truncate">{row.title}</span>
              {properties.slice(0, 3).map((property) => (
                <span
                  key={property._id}
                  className="hidden text-xs text-muted-foreground sm:inline"
                >
                  {valuesFor[row._id]?.[property.key] || "—"}
                </span>
              ))}
            </div>
          ))}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAddRow}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New row
          </Button>
        </div>
      )}

      {viewType === "gallery" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {(visibleRows as Row[]).map(({ row }) => (
            <div
              key={row._id}
              className="overflow-hidden rounded-lg border notion-hover hover:shadow-sm"
            >
              <div className="flex h-24 items-center justify-center bg-secondary/60 text-3xl">
                {row.icon ?? "📄"}
              </div>
              <div className="p-2 text-sm">{row.title}</div>
            </div>
          ))}
          <button
            role="button"
            onClick={onAddRow}
            className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground notion-hover hover:bg-accent"
          >
            <Plus className="mr-1 h-4 w-4" />
            New row
          </button>
        </div>
      )}

      {viewType === "calendar" && (
        <CalendarView
          rows={visibleRows as Row[]}
          properties={properties}
          valuesFor={valuesFor}
        />
      )}

      <PropertyEditor
        property={editingProperty}
        databaseId={databaseId}
        open={Boolean(editingProperty)}
        onOpenChange={(open) => !open && setEditingProperty(undefined)}
      />

      <PropertyEditor
        property={undefined}
        databaseId={databaseId}
        open={newPropertyOpen}
        onOpenChange={setNewPropertyOpen}
      />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import from CSV</DialogTitle>
            <DialogDescription>
              The first column is used as the title of every row. Columns that
              do not exist yet are created automatically.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={csv}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setCsv(event.target.value)
            }
            placeholder={"Name,Status,Due\nWebsite redesign,In progress,2024-06-01"}
            className="min-h-[200px] font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onImportCsv}>Import rows</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RenameDialog
        open={Boolean(renaming)}
        title={renaming?.title ?? ""}
        onOpenChange={(open) => !open && setRenaming(null)}
        onSubmit={async (title) => {
          if (renaming) {
            await update({ id: renaming.id, title: title || "Untitled" });
          }
          setRenaming(null);
        }}
      />
    </div>
  );
};

const CalendarView = ({
  rows,
  properties,
  valuesFor,
}: {
  rows: Row[];
  properties: DatabaseProperty[];
  valuesFor: Record<string, Record<string, string>>;
}) => {
  const dateProperty = properties.find((property) => property.type === "date");
  const [month, setMonth] = useState(() => new Date());

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [month]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
          }
        >
          Prev
        </Button>
        <span className="text-sm font-medium">
          {month.toLocaleString(undefined, { month: "long", year: "numeric" })}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
          }
        >
          Next
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="bg-secondary/60 px-2 py-1 text-center text-xs font-medium">
            {day}
          </div>
        ))}
        {days.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const dayRows = rows.filter((entry) => {
            if (!dateProperty) return false;
            return (valuesFor[entry.row._id]?.[dateProperty.key] ?? "").startsWith(
              key,
            );
          });
          const isCurrentMonth = day.getMonth() === month.getMonth();
          return (
            <div
              key={key}
              className={`min-h-[90px] bg-background p-1 ${
                isCurrentMonth ? "" : "text-muted-foreground/50"
              }`}
            >
              <div className="text-[11px]">{day.getDate()}</div>
              <div className="space-y-1">
                {dayRows.map((entry) => (
                  <div
                    key={entry.row._id}
                    className="truncate rounded bg-accent px-1 py-0.5 text-[11px]"
                  >
                    {entry.row.icon} {entry.row.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
