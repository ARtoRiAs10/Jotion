"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

/**
 * The error boundary of the public pages.
 */
export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Jotion marketing error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </span>
      <div>
        <h1 className="text-lg font-semibold">This page could not be loaded</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {error.message || "An unexpected error happened."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => reset()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
        <Button onClick={() => window.location.assign("/")}>
          <Home className="mr-2 h-4 w-4" />
          Go to the start page
        </Button>
      </div>
    </div>
  );
}
