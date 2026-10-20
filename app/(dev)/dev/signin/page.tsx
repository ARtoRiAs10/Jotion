"use client";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAction } from "convex/react";
import { LogIn, ShieldAlert, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DevUser,
  getDevUser,
  signInAsDevUser,
  signOutDevUser,
} from "@/lib/dev-auth";

/**
 * The development sign-in.
 *
 * It is only available on a deployment that has `ALLOW_DEV_AUTH=true` — the
 * production deployment refuses to issue a token, so this page is empty
 * there. The link to it is not published anywhere.
 */
export default function DevSignInPage() {
  const router = useRouter();
  const listUsers = useAction(api.devAuth.listUsers);
  const signIn = useAction(api.devAuth.signIn);

  const [users, setUsers] = useState<DevUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<DevUser | null>(null);

  useEffect(() => {
    setCurrent(getDevUser());
    listUsers({})
      .then((result) => setUsers(result as DevUser[]))
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "The development sign-in is not available.",
        ),
      );
  }, [listUsers]);

  const onSignIn = async (user: DevUser) => {
    setBusy(true);
    try {
      const result = await signIn({ userId: user.userId });
      await signInAsDevUser(result.user, result.token);
      toast.success(`Signed in as ${result.user.name}`);
      router.push("/documents");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not sign in",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 p-6">
      <div className="w-full max-w-md rounded-xl border bg-background p-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
        </span>

        <h1 className="mt-4 text-lg font-bold tracking-tight">
          Development sign-in
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in as one of the test users without a Clerk account. This is
          only available on the development deployment.
        </p>

        {error ? (
          <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            {error}
          </div>
        ) : !users ? (
          <p className="mt-5 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="mt-5 space-y-2">
            {users.map((user) => (
              <button
                key={user.userId}
                role="button"
                disabled={busy}
                onClick={() => onSignIn(user)}
                className="flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm notion-hover hover:bg-accent/50 disabled:opacity-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-medium">
                  <UserRound className="h-4 w-4" />
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{user.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {user.email}
                  </span>
                </span>
                <LogIn className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {current && (
          <div className="mt-6 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              You are signed in as{" "}
              <span className="font-medium text-foreground">
                {current.name}
              </span>
              .
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={async () => {
                signOutDevUser();
                setCurrent(null);
                toast.success("Signed out");
                router.refresh();
              }}
            >
              Sign out
            </Button>
          </div>
        )}

        <p className="mt-6 text-[11px] text-muted-foreground">
          This page is not linked from the application. The deployment has to
          have <code className="font-mono">ALLOW_DEV_AUTH=true</code> and a{" "}
          <code className="font-mono">DEV_AUTH_SECRET</code> for it to work.
        </p>
      </div>
    </div>
  );
}
