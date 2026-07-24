"use client";

/**
 * Global fallback deliberately has no application providers. Next can render
 * this boundary while the root tree is unavailable, so it must not depend on
 * ThemeProvider, Toaster, or any context-backed client component.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", fontFamily: "system-ui, sans-serif", background: "#f7f7f2", color: "#1d241b" }}>
        <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: "2rem" }}>
          <section style={{ maxWidth: 520, border: "1px solid #d9ded2", borderRadius: 16, background: "white", padding: "2rem", boxShadow: "0 12px 40px rgba(29,36,27,.08)" }}>
            <p style={{ margin: 0, color: "#65725f", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Harly</p>
            <h1 style={{ margin: "1rem 0 .5rem", fontSize: 28 }}>Something went wrong</h1>
            <p style={{ margin: 0, color: "#65725f", lineHeight: 1.6 }}>The application could not render this page. Try again, or return to Harly if the problem continues.</p>
            <button type="button" onClick={() => reset()} style={{ marginTop: "1.5rem", cursor: "pointer", border: 0, borderRadius: 8, background: "#b7e36b", padding: ".7rem 1rem", fontWeight: 700 }}>Try again</button>
          </section>
        </main>
      </body>
    </html>
  );
}
