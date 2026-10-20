"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { validateFormula } from "@/lib/formula";

export const PROPERTY_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "multi_select", label: "Multi-select" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "person", label: "Person" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "formula", label: "Formula" },
  { value: "relation", label: "Relation" },
  { value: "rollup", label: "Rollup" },
];

export const PropertyEditor = ({
  property,
  databaseId,
  open,
  onOpenChange,
}: {
  property?:
    | {
        _id: Id<"databaseProperties">;
        key: string;
        name: string;
        type: string;
        options?: string[];
      }
    | undefined;
  databaseId?: Id<"documents">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const updateProperty = useMutation(api.databases.updateProperty);
  const removeProperty = useMutation(api.databases.removeProperty);
  const addProperty = useMutation(api.databases.addProperty);

  const isCreating = !property;

  const [name, setName] = useState("");
  const [type, setType] = useState("text");
  const [options, setOptions] = useState("");
  const [formula, setFormula] = useState("");
  const [relationDatabase, setRelationDatabase] = useState("");
  const [rollupRelation, setRollupRelation] = useState("");
  const [rollupProperty, setRollupProperty] = useState("");
  const [rollupAggregation, setRollupAggregation] = useState("count");

  const databases = useQuery(api.databases.listDatabases, {
    workspaceId: undefined,
  });
  const targetDatabase = useQuery(
    api.databases.getDatabase,
    relationDatabase
      ? { databaseId: relationDatabase as Id<"documents"> }
      : ("skip" as never),
  );

  useEffect(() => {
    if (!property) {
      setName("");
      setType("text");
      setOptions("");
      setFormula("");
      setRelationDatabase("");
      setRollupRelation("");
      setRollupProperty("");
      setRollupAggregation("count");
      return;
    }
    if (property.type === "relation") {
      setRelationDatabase(property.options?.[0] ?? "");
    }
    if (property.type === "rollup") {
      setRollupRelation(property.options?.[0] ?? "");
      setRollupProperty(property.options?.[1] ?? "");
      setRollupAggregation(property.options?.[2] ?? "count");
    }
    setName(property.name);
    setType(property.type);
    setOptions((property.options ?? []).join(", "));
    setFormula(
      property.type === "formula" ? (property.options?.[0] ?? "") : "",
    );
  }, [property]);

  const onSave = async () => {
    if (isCreating) {
      if (!databaseId) return;
      try {
        await addProperty({
          databaseId,
          name: name || "Property",
          type,
          options:
            type === "formula"
              ? [formula]
              : type === "relation"
                ? [relationDatabase]
                : type === "rollup"
                  ? [rollupRelation, rollupProperty, rollupAggregation]
                  : options
                      .split(",")
                      .map((option) => option.trim())
                      .filter(Boolean),
        });
        onOpenChange(false);
        toast.success("Property created");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not create the property",
        );
      }
      return;
    }

    if (!property) return;
    try {
      const nextOptions =
        type === "formula"
          ? [formula]
          : type === "relation"
            ? [relationDatabase]
            : type === "rollup"
              ? [rollupRelation, rollupProperty, rollupAggregation]
              : type === "select" || type === "multi_select"
                ? options
                    .split(",")
                    .map((option) => option.trim())
                    .filter(Boolean)
                : property.options;

      await updateProperty({
        propertyId: property._id,
        name,
        type,
        options: nextOptions,
      });
      onOpenChange(false);
      toast.success("Property updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update the property",
      );
    }
  };

  const formulaCheck = validateFormula(formula);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isCreating ? "New property" : "Edit property"}
          </DialogTitle>
          <DialogDescription>
            Properties describe the columns of your database.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="property-name">Name</Label>
            <Input
              id="property-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              {PROPERTY_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>

          {(type === "select" || type === "multi_select") && (
            <div className="space-y-1.5">
              <Label htmlFor="property-options">Options</Label>
              <Input
                id="property-options"
                value={options}
                onChange={(event) => setOptions(event.target.value)}
                placeholder="Not started, In progress, Done"
              />
              <p className="text-[11px] text-muted-foreground">
                Separate the options with commas.
              </p>
            </div>
          )}

          {type === "relation" && (
            <div className="space-y-1.5">
              <Label>Related database</Label>
              <Select
                value={relationDatabase}
                onValueChange={setRelationDatabase}
              >
                <option value="">Select a database…</option>
                {databases?.map((database) => (
                  <option key={database._id} value={database._id}>
                    {database.icon ? `${database.icon} ` : ""}
                    {database.title}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Rows of this database can be linked to the rows of the page.
              </p>
            </div>
          )}

          {type === "rollup" && (
            <div className="space-y-1.5">
              <Label>Rollup</Label>
              <Select
                value={rollupRelation}
                onValueChange={setRollupRelation}
              >
                <option value="">Relation column…</option>
                {targetDatabase?.properties
                  ?.filter(
                    (property: { type: string }) => property.type === "relation",
                  )
                  .map((property: { _id: string; key: string; name: string }) => (
                    <option key={property._id} value={property.key}>
                      {property.name}
                    </option>
                  ))}
              </Select>
              <Select
                value={rollupProperty}
                onValueChange={setRollupProperty}
              >
                <option value="">Property to aggregate…</option>
                {targetDatabase?.properties
                  ?.filter(
                    (property: { type: string }) => property.type !== "relation",
                  )
                  .map((property: { _id: string; key: string; name: string }) => (
                    <option key={property._id} value={property.key}>
                      {property.name}
                    </option>
                  ))}
              </Select>
              <Select
                value={rollupAggregation}
                onValueChange={setRollupAggregation}
              >
                {["count", "sum", "avg", "min", "max", "list"].map(
                  (aggregation) => (
                    <option key={aggregation} value={aggregation}>
                      {aggregation}
                    </option>
                  ),
                )}
              </Select>
              <p className="text-[11px] text-muted-foreground">
                A rollup aggregates a property of the related rows.
              </p>
            </div>
          )}

          {type === "formula" && (
            <div className="space-y-1.5">
              <Label htmlFor="property-formula">Formula</Label>
              <Input
                id="property-formula"
                value={formula}
                onChange={(event) => setFormula(event.target.value)}
                placeholder={'concat(prop("First name"), " ", prop("Last name"))'}
              />
              <p
                className={`text-[11px] ${
                  formulaCheck.valid ? "text-muted-foreground" : "text-destructive"
                }`}
              >
                {formulaCheck.valid
                  ? 'Use prop("Column name") to reference another column.'
                  : formulaCheck.error}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {!isCreating && property && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                await removeProperty({ propertyId: property._id });
                onOpenChange(false);
                toast.success("Property deleted");
              }}
            >
              Delete
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
