"use client";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Lock, Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const DEFAULT_PERMISSIONS = [
  { value: "edit", label: "Can edit" },
  { value: "comment", label: "Can comment" },
  { value: "view", label: "Can view" },
  { value: "none", label: "No access" },
];

const PERSON_PERMISSIONS = [
  { value: "edit", label: "Can edit" },
  { value: "comment", label: "Can comment" },
  { value: "view", label: "Can view" },
];

/**
 * The permissions of a database: the default for everybody in the workspace
 * and a special permission for individual people.
 */
export const PermissionsPanel = ({
  databaseId,
  currentPermission,
}: {
  databaseId: Id<"documents">;
  currentPermission?: string;
}) => {
  const { workspaceId, role } = useWorkspace();
  const database = useQuery(api.databases.getDatabase, { databaseId });
  const access = useQuery(api.databases.listAccess, { databaseId });
  const members = useQuery(api.workspaces.listMembers, {
    workspaceId: workspaceId as never,
  });

  const setDefault = useMutation(api.databases.setDefaultPermission);
  const setAccess = useMutation(api.databases.setAccess);
  const removeAccess = useMutation(api.databases.removeAccess);

  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("view");
  const [open, setOpen] = useState(false);

  const isOwner = role === "owner" || role === "admin";
  const defaultPermission = database?.database.dbPermission ?? "edit";

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" />
          Permissions
        </h3>
        {isOwner && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setOpen((value) => !value)}
          >
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
            Share
          </Button>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {currentPermission === "edit"
          ? "You can edit this database."
          : currentPermission === "comment"
            ? "You can view and comment on this database."
            : currentPermission === "view"
              ? "You have read-only access to this database."
              : "You do not have access to this database."}
      </p>

      {isOwner && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Everybody in the workspace
          </span>
          <Select
            value={defaultPermission}
            onValueChange={async (value) => {
              try {
                await setDefault({ databaseId, permission: value });
                toast.success("The default permission was changed");
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not change the permission",
                );
              }
            }}
            className="h-8 w-40 text-xs"
          >
            {DEFAULT_PERMISSIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      {open && isOwner && (
        <div className="mt-3 space-y-2 rounded-md border bg-secondary/30 p-3">
          <p className="text-xs font-medium">Give a person access</p>
          <div className="flex items-center gap-2">
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="E-mail address"
              className="h-8 text-xs"
            />
            <Select
              value={permission}
              onValueChange={setPermission}
              className="h-8 w-32 text-xs"
            >
              {PERSON_PERMISSIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!email.trim()}
              onClick={async () => {
                try {
                  await setAccess({
                    databaseId,
                    email: email.trim(),
                    permission,
                  });
                  setEmail("");
                  toast.success("Access granted");
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not grant the access",
                  );
                }
              }}
            >
              Grant
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {access?.map((entry) => (
          <div
            key={entry._id}
            className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-medium">
              {(entry.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="flex-1 truncate">{entry.name}</span>
            {isOwner ? (
              <>
                <Select
                  value={entry.permission}
                  onValueChange={async (value) => {
                    await setAccess({
                      databaseId,
                      userId: entry.userId,
                      permission: value,
                    });
                    toast.success("Access updated");
                  }}
                  className="h-7 w-28 text-xs"
                >
                  {PERSON_PERMISSIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive"
                  onClick={async () => {
                    await removeAccess({ accessId: entry._id });
                    toast.success("Access removed");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {entry.permission}
              </span>
            )}
          </div>
        ))}
        {access?.length === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            Everybody follows the default permission.
          </p>
        )}
      </div>

      {members && members.length > 0 && !isOwner && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {members.length} member{members.length === 1 ? "" : "s"} in this
          workspace.
        </p>
      )}
    </div>
  );
};
