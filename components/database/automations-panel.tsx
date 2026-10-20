"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Bell, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * The automations of a database: when a property of a row reaches a value,
 * an action is executed (set another property or notify the team).
 */
export const AutomationsPanel = ({
  databaseId,
  properties,
}: {
  databaseId: Id<"documents">;
  properties: { key: string; name: string; type: string }[];
}) => {
  const automations = useQuery(api.databases.listAutomations, { databaseId });
  const createAutomation = useMutation(api.databases.createAutomation);
  const removeAutomation = useMutation(api.databases.removeAutomation);
  const updateAutomation = useMutation(api.databases.updateAutomation);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    triggerKey: "",
    triggerValue: "",
    actionType: "setProperty",
    actionKey: "",
    actionValue: "",
  });

  const onCreate = async () => {
    if (!form.triggerKey || !form.name.trim()) {
      toast.error("Give the automation a name and a trigger");
      return;
    }
    try {
      await createAutomation({
        databaseId,
        name: form.name.trim(),
        triggerKey: form.triggerKey,
        triggerValue: form.triggerValue,
        actions:
          form.actionType === "notify"
            ? [{ type: "notify" }]
            : [
                {
                  type: "setProperty",
                  key: form.actionKey,
                  value: form.actionValue,
                },
              ],
      });
      setOpen(false);
      setForm({
        name: "",
        triggerKey: "",
        triggerValue: "",
        actionType: "setProperty",
        actionKey: "",
        actionValue: "",
      });
      toast.success("Automation created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create the automation",
      );
    }
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Zap className="h-4 w-4 text-amber-500" />
          Automations
        </h3>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => setOpen((value) => !value)}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New automation
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-3 rounded-md border bg-secondary/30 p-3">
          <div className="space-y-1.5">
            <Label htmlFor="automation-name">Name</Label>
            <Input
              id="automation-name"
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              placeholder="Notify the team when a task is done"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>When</Label>
              <Select
                value={form.triggerKey}
                onValueChange={(value) =>
                  setForm({ ...form, triggerKey: value })
                }
              >
                <option value="">Select a property…</option>
                {properties.map((property) => (
                  <option key={property.key} value={property.key}>
                    {property.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Equals</Label>
              <Input
                value={form.triggerValue}
                onChange={(event) =>
                  setForm({ ...form, triggerValue: event.target.value })
                }
                placeholder="Done"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Then</Label>
              <Select
                value={form.actionType}
                onValueChange={(value) =>
                  setForm({ ...form, actionType: value })
                }
              >
                <option value="setProperty">Set a property</option>
                <option value="notify">Notify the team</option>
              </Select>
            </div>
            {form.actionType === "setProperty" && (
              <>
                <div className="space-y-1.5">
                  <Label>Property</Label>
                  <Select
                    value={form.actionKey}
                    onValueChange={(value) =>
                      setForm({ ...form, actionKey: value })
                    }
                  >
                    <option value="">Select a property…</option>
                    {properties.map((property) => (
                      <option key={property.key} value={property.key}>
                        {property.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Value</Label>
                  <Input
                    value={form.actionValue}
                    onChange={(event) =>
                      setForm({ ...form, actionValue: event.target.value })
                    }
                  />
                </div>
              </>
            )}
          </div>

          <Button size="sm" onClick={onCreate}>
            Create automation
          </Button>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {automations?.map((automation) => (
          <div
            key={automation._id}
            className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
          >
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span className="flex-1 truncate">
              {automation.name}
              <span className="ml-2 text-xs text-muted-foreground">
                {properties.find((p) => p.key === automation.triggerKey)?.name ??
                  automation.triggerKey}{" "}
                = {automation.triggerValue || "any"} →{" "}
                {automation.actions.map((action) =>
                  action.type === "notify" ? (
                    <Bell key={action.type} className="inline h-3 w-3" />
                  ) : (
                    <span key={action.type}>
                      {properties.find((p) => p.key === action.key)?.name ??
                        action.key}{" "}
                      = {action.value}
                    </span>
                  ),
                )}
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={async () => {
                await updateAutomation({
                  automationId: automation._id,
                  enabled: automation.enabled === false,
                });
              }}
            >
              {automation.enabled === false ? "Enable" : "Disable"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-destructive"
              onClick={async () => {
                await removeAutomation({ automationId: automation._id });
                toast.success("Automation removed");
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {automations?.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No automations yet. Automate the repetitive parts of your database.
          </p>
        )}
      </div>
    </div>
  );
};
