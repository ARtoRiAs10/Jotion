"use client";

import { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";

/**
 * Checks that the app is configured before it tries to talk to Clerk and
 * Convex.
 *
 * Without this check a missing environment variable crashes the whole
 * application with an obscure error ("Missing publishableKey") instead of
 * explaining what has to be set.
 */

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const getConfigurationIssues = () => {
  const issues: string[] = [];

  if (!CLERK_KEY) {
    issues.push(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing — copy it from the Clerk dashboard (API keys).",
    );
  }

  if (!CONVEX_URL) {
    issues.push(
      "NEXT_PUBLIC_CONVEX_URL is missing — run `npx convex dev` and copy the URL it prints.",
    );
  } else if (!CONVEX_URL.includes(".convex.cloud")) {
    issues.push(
      `NEXT_PUBLIC_CONVEX_URL does not look like a Convex deployment (${CONVEX_URL}).`,
    );
  }

  return issues;
};

export const ConfigurationCheck = ({ children }: { children: ReactNode }) => {
  const issues = getConfigurationIssues();

  if (issues.length === 0) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl rounded-xl border p-8">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </span>

        <h1 className="mt-4 text-xl font-bold tracking-tight">
          Jotion needs a little configuration
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The application could not start because some environment variables are
          missing. Add them to <code className="font-mono text-xs">.env.local</code>{" "}
          (or to your hosting platform) and restart the app.
        </p>

        <ul className="mt-5 space-y-2">
          {issues.map((issue) => (
            <li
              key={issue}
              className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-md border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Quick start
          </p>
          <pre className="mt-2 overflow-x-auto text-xs leading-relaxed text-muted-foreground">
{`cp .env.example .env.local
# 1. npx convex dev        → prints NEXT_PUBLIC_CONVEX_URL
# 2. dashboard.clerk.com  → copy the publishable key
npm run dev`}
          </pre>
        </div>

        <a
          href="https://docs.convex.dev/hosting"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground notion-hover hover:text-foreground"
        >
          <CheckCircle2 className="h-4 w-4" />
          Read the hosting guide
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
};
