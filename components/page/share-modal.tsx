"use client";

import { useWorkspace } from "@/components/providers/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Check,
  Copy,
  Globe,
  Link2,
  Lock,
  Mail,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOrigin } from "@/hooks/use-origin";

const ACCESS_OPTIONS = [
  { value: "none", label: "Restricted", icon: Lock },
  { value: "read", label: "Can view", icon: Globe },
  { value: "comment", label: "Can comment", icon: Mail },
  { value: "edit", label: "Can edit", icon: Check },
];

const PERMISSION_OPTIONS = [
  { value: "read", label: "Can view" },
  { value: "comment", label: "Can comment" },
  { value: "edit", label: "Can edit" },
];

export const ShareModal = ({
  document,
  open,
  onOpenChange,
}: {
  document: Doc<"documents">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { workspaceId, workspace, isOwner } = useWorkspace();
  const origin = useOrigin();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [password, setPassword] = useState("");

  const invite = useMutation(api.workspaces.inviteMember);
  const setPublicAccess = useMutation(api.documents.setPublicAccess);
  const setRestricted = useMutation(api.documents.setRestricted);
  const setPageAccess = useMutation(api.documents.setPageAccess);
  const removePageAccess = useMutation(api.documents.removePageAccess);

  const members = useQuery(api.workspaces.listMembers, {
    workspaceId: workspaceId as never,
  });
  const pageAccess = useQuery(api.documents.listPageAccess, {
    documentId: document._id,
  });

  const publicAccess = document.publicAccess ?? "none";
  const url = `${origin}/preview/${document._id}`;
  const isRestricted = Boolean(document.isRestricted);

  const onInvite = async () => {
    if (!email.trim()) return;
    try {
      await invite({
        workspaceId: workspaceId as never,
        email: email.trim(),
        role,
      });
      setEmail("");
      toast.success("Invitation sent");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to invite member",
      );
    }
  };

  const onGrant = async (userId: string, permission: string) => {
    try {
      await setPageAccess({
        documentId: document._id,
        userId,
        permission,
      });
      toast.success("Access updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update access",
      );
    }
  };

  const onCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  const permissionFor = (userId: string) =>
    pageAccess?.find((entry) => entry.userId === userId)?.permission ?? "read";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-base">
            Share &ldquo;{document.title || "Untitled"}&rdquo;
          </DialogTitle>
          <DialogDescription className="text-xs">
            Manage who can access this page in{" "}
            {workspace?.name ?? "your workspace"}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 pb-4 thin-scrollbar">
          <div className="flex items-center gap-2">
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onInvite()}
              placeholder="Email or name"
              className="h-9"
            />
            <Select
              value={role}
              onValueChange={setRole}
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

          {/* -------------------------------------------------- */}
          {/*  Workspace access                                  */}
          {/* -------------------------------------------------- */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              {isRestricted ? (
                <Lock className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Globe className="h-4 w-4 text-sky-500" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {isRestricted ? "Restricted page" : "Teamspace page"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {isRestricted
                    ? "Only people you give access to can open this page."
                    : "Everyone in this workspace can open this page."}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={async () => {
                  await setRestricted({
                    id: document._id,
                    isRestricted: !isRestricted,
                  });
                  toast.success(
                    isRestricted
                      ? "The page is now visible to the whole workspace"
                      : "The page is now restricted",
                  );
                }}
              >
                {isRestricted ? "Make public" : "Restrict"}
              </Button>
            </div>
          </div>

          {/* -------------------------------------------------- */}
          {/*  People with access                                */}
          {/* -------------------------------------------------- */}
          {isRestricted && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                People with access
              </p>
              <div className="max-h-52 space-y-1 overflow-y-auto thin-scrollbar">
                {members?.map((member) => {
                  const permission = permissionFor(member.userId);
                  const entry = pageAccess?.find(
                    (item) => item.userId === member.userId,
                  );
                  return (
                    <div
                      key={member._id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5"
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-medium">
                        {member.name?.slice(0, 1).toUpperCase() ?? "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{member.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                      <Select
                        value={permission}
                        onValueChange={(value) =>
                          onGrant(member.userId, value)
                        }
                        className="h-8 w-32 text-xs"
                      >
                        {PERMISSION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                      {entry && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive"
                          onClick={async () => {
                            await removePageAccess({ accessId: entry._id });
                            toast.success("Access removed");
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="Give access to someone else…"
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={!inviteEmail.trim()}
                  onClick={async () => {
                    await setPageAccess({
                      documentId: document._id,
                      email: inviteEmail.trim(),
                      permission: "read",
                    });
                    setInviteEmail("");
                    toast.success("Access granted");
                  }}
                >
                  Grant
                </Button>
              </div>
            </div>
          )}

          {/* -------------------------------------------------- */}
          {/*  Link sharing                                     */}
          {/* -------------------------------------------------- */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              {publicAccess === "none" ? (
                <Lock className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Globe className="h-4 w-4 text-sky-500" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {publicAccess === "none"
                    ? "Restricted access"
                    : "Anyone with the link"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {publicAccess === "none"
                    ? "Only people in this workspace can open the page."
                    : "Anyone with the link can open this page."}
                </p>
              </div>
              <Select
                value={publicAccess}
                onValueChange={(value) =>
                  setPublicAccess({ id: document._id, publicAccess: value })
                }
                className="w-32"
              >
                {ACCESS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            {publicAccess !== "none" && (
              <div className="mt-3 flex items-center gap-2 border-t pt-3">
                <Input
                  type="text"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Require a password (optional)"
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={async () => {
                    await setPublicAccess({
                      id: document._id,
                      publicAccess,
                      password: password || undefined,
                    });
                    toast.success(
                      password ? "Password protection enabled" : "Password removed",
                    );
                  }}
                >
                  Save
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-md border px-3 py-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <span className="truncate text-sm text-muted-foreground">{url}</span>
            </div>
            <Button variant="outline" onClick={onCopy}>
              {copied ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              Copy link
            </Button>
          </div>

          {!isOwner && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Trash2 className="h-3 w-3" />
              Only workspace owners can change the default access.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
