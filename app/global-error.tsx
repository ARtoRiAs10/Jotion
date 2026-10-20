"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * The last resort error boundary — it replaces the whole document when the
 * root layout fails.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Jotion fatal error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          color: "#111",
          background: "#fff",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 480 }}>
          <AlertTriangle
            style={{ margin: "0 auto 16px", width: 32, height: 32, color: "#dc2626" }}
          />
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            Jotion could not start
          </h1>
          <p style={{ fontSize: 14, color: "#666", marginTop: 8 }}>
            {error.message ||
              "An unexpected error happened while loading the application."}
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 20,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fafafa",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Reload Jotion
          </button>
        </div>
      </body>
    </html>
  );
}
