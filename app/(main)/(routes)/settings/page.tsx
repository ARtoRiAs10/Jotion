"use client";

import { BillingSettings } from "@/components/billing/billing-settings";
import { ModeToggle } from "@/components/mode-toggle";
import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  CreditCard,
  Settings2,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSafeSearchParams } from "@/hooks/use-safe-search-params";
import { useEffect, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { toast } from "sonner";
import { formatDate, relativeTime } from "@/lib/utils";
import { describeLimit } from "@/lib/plans";

const TABS = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "members", label: "Members", icon: Users },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "trash", label: "Trash", icon: Trash2 },
];

const SettingsPage = () => {
  const router = useRouter();
  const params = useSafeSearchParams();
  const { workspaceId, workspace, isOwner, role, plan } = useWorkspace();

  const [tab, setTab] = useState(params.get("tab") ?? "general");
  const [name, setName] = useState(workspace?.name ?? "");
  const [icon, setIcon] = useState(workspace?.icon ?? "🪄");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const updateWorkspace = useMutation(api.workspaces.update);
  const inviteMember = useMutation(api.workspaces.inviteMember);
  const updateRole = useMutation(api.workspaces.updateMemberRole);
  const removeMember = useMutation(api.workspaces.removeMember);
  const removeWorkspace = useMutation(api.workspaces.remove);
  const restore = useMutation(api.documents.restore);
  const removeDocument = useMutation(api.documents.remove);

  const members = useQuery(api.workspaces.listMembers, {
    workspaceId: workspaceId as never,
  });
  const activity = usePaginatedQuery(
    api.activity.auditLogPaginated,
    { workspaceId: workspaceId as never },
    { initialNumItems: 25 },
  );
  const trash = useQuery(api.documents.getTrash, {
    workspaceId: workspaceId as never,
  });

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setIcon(workspace.icon ?? "🪄");
    }
  }, [workspace]);

  useEffect(() => {
    const requested = params.get("tab");
    if (requested) setTab(requested);
  }, [params]);

  const onInvite = async () => {
    if (!email.trim()) return;
    try {
      await inviteMember({
        workspaceId: workspaceId as never,
        email: email.trim(),
        role: inviteRole,
      });
      setEmail("");
      toast.success("Invitation sent");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to invite member",
      );
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your workspace, members and billing.
      </p>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b thin-scrollbar">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="button"
            onClick={() => {
              setTab(item.id);
              router.replace(`/settings?tab=${item.id}`);
            }}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm notion-hover ${
              tab === item.id
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "general" && (
          <div className="max-w-2xl space-y-6">
            <div className="rounded-lg border p-5">
              <h2 className="text-sm font-semibold">Workspace</h2>
              <div className="mt-4 flex items-center gap-3">
                <Input
                  value={icon}
                  onChange={(event) => setIcon(event.target.value)}
                  className="w-16 text-center text-lg"
                />
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Workspace name"
                />
                <Button
                  onClick={async () => {
                    await updateWorkspace({
                      workspaceId: workspaceId as never,
                      name,
                      icon,
                    });
                    toast.success("Workspace updated");
                  }}
                >
                  Save
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Only owners and admins can rename the workspace.
              </p>
            </div>

            <div className="rounded-lg border p-5">
              <h2 className="text-sm font-semibold">Appearance</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose how Jotion looks on this device.
              </p>
              <div className="mt-3">
                <ModeToggle />
              </div>
            </div>

            <div className="rounded-lg border p-5">
              <h2 className="text-sm font-semibold">Your role</h2>
              <p className="mt-1 text-xs capitalize text-muted-foreground">
                {role} in {workspace?.name} · {plan.name} plan
              </p>
            </div>
          </div>
        )}

        {tab === "members" && (
          <div className="max-w-2xl space-y-6">
            <div className="rounded-lg border p-5">
              <h2 className="text-sm font-semibold">Invite people</h2>
              <div className="mt-3 flex items-center gap-2">
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && onInvite()}
                  placeholder="Email address"
                />
                <Select
                  value={inviteRole}
                  onValueChange={setInviteRole}
                  className="w-28"
                >
                  <option value="member">Member</option>
                  <option value="guest">Guest</option>
                  <option value="admin">Admin</option>
                </Select>
                <Button onClick={onInvite} disabled={!email.trim()}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Your {plan.name} plan allows {describeLimit(plan.limits.guests)}{" "}
                guests.
              </p>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Person</th>
                    <th className="px-3 py-2 text-left font-medium">Role</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {members?.map((member) => (
                    <tr key={member._id} className="border-t">
                      <td className="px-3 py-2">
                        <p className="font-medium">{member.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {member.email}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        {isOwner ? (
                          <Select
                            className="h-8 w-28"
                            value={member.role}
                            onValueChange={(value) =>
                              updateRole({
                                workspaceId: workspaceId as never,
                                memberId: member._id,
                                role: value,
                              })
                            }
                          >
                            <option value="owner">Owner</option>
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="guest">Guest</option>
                          </Select>
                        ) : (
                          <span className="capitalize text-muted-foreground">
                            {member.role}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isOwner && member.role !== "owner" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive"
                            onClick={async () => {
                              await removeMember({
                                workspaceId: workspaceId as never,
                                memberId: member._id,
                              });
                              toast.success("Member removed");
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isOwner && (
              <div className="rounded-lg border border-destructive/40 p-5">
                <h2 className="text-sm font-semibold text-destructive">
                  Delete workspace
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  This permanently deletes the workspace, all of its pages and
                  its billing history.
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  className="mt-3"
                  onClick={async () => {
                    await removeWorkspace({ workspaceId: workspaceId as never });
                    toast.success("Workspace deleted");
                    router.push("/");
                  }}
                >
                  Delete workspace
                </Button>
              </div>
            )}
          </div>
        )}

        {tab === "billing" && <BillingSettings />}

        {tab === "activity" && (
          <div className="max-w-2xl space-y-2">
            <p className="mb-3 text-xs text-muted-foreground">
              A complete audit trail of everything that happens in this
              workspace.
            </p>
            {activity?.results.map((entry) => (
              <div
                key={entry._id}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <span className="flex-1">
                  <span className="font-medium">
                    {entry.userName ?? "Someone"}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {entry.action.replace(/[._]/g, " ")}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {relativeTime(entry.createdAt)}
                </span>
              </div>
            ))}
            {activity?.results.length === 0 && (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
            {activity.status === "CanLoadMore" && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => activity.loadMore(25)}
              >
                Load more
              </Button>
            )}
          </div>
        )}

        {tab === "trash" && (
          <div className="max-w-2xl space-y-2">
            {trash?.map((document) => (
              <div
                key={document._id}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <span className="flex-1 truncate">{document.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatDate(document.lastEditedAt ?? Date.now())}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => restore({ id: document._id })}
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive"
                  onClick={() => removeDocument({ id: document._id })}
                >
                  Delete forever
                </Button>
              </div>
            ))}
            {trash?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                The trash is empty.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
