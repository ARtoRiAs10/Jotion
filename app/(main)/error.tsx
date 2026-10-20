"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

/**
 * Error boundary for the workspace shell. A single failing page (or a
 * Convex subscription that dies) no longer takes the whole application down.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Jotion workspace error:", error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </span>
      <div>
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {error.message ||
            "An unexpected error interrupted the workspace. Your data is safe."}
        </p>
        {error.digest && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => reset()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
        <Button onClick={() => window.location.assign("/documents")}>
          <Home className="mr-2 h-4 w-4" />
          Back to the workspace
        </Button>
      </div>
    </div>
  );
}
