"use client";

// Catches errors thrown in the root layout itself (either [locale]/layout.tsx
// or (app)/layout.tsx) — the one place where the translation machinery this
// app otherwise relies on everywhere else could itself be what failed, so
// this file is deliberately plain, static English rather than routed through
// next-intl. It must supply its own <html>/<body> (it replaces the root
// layout entirely) and, per Next.js's error.js contract, must be a Client
// Component — metadata exports aren't supported here.
import "./globals.css";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#08080a",
          color: "#f4f4f5",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: "28rem", padding: "2.5rem", textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#a1a1aa" }}>
            An unexpected error occurred. Try again, or head back to the homepage.
          </p>
          <div
            style={{
              marginTop: "1.5rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              justifyContent: "center",
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                minHeight: "2.75rem",
                borderRadius: "0.5rem",
                backgroundColor: "#e11d2e",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.875rem",
                padding: "0.625rem 1.5rem",
                border: "none",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* Plain <a>, not next/link's <Link>: this file replaces the
                entire root layout when the app itself has crashed, so its
                recovery UI must not depend on Next.js router machinery that
                could be part of what's broken. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                minHeight: "2.75rem",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "0.5rem",
                border: "1px solid #2a2a30",
                color: "#d4d4d8",
                fontWeight: 600,
                fontSize: "0.875rem",
                padding: "0.625rem 1.5rem",
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
