"use client";

import { useSyncExternalStore } from "react";

import { defaultLocale, type Locale } from "@/i18n/config";
import { negotiateLocale } from "@/i18n/negotiate";

/**
 * Copy lives here, not in the message catalogs: this boundary renders without
 * the next-intl provider, so it cannot call useTranslations. The language comes
 * from the browser (the locale cookie is HttpOnly and unreadable from here).
 */
const copy: Record<Locale, { title: string; body: string; retry: string }> = {
  en: {
    title: "Something went wrong",
    body: "The application could not render this page. Try again, or return to Harly if the problem continues.",
    retry: "Try again",
  },
  es: {
    title: "Algo salió mal",
    body: "La aplicación no pudo mostrar esta página. Inténtalo de nuevo o vuelve a Harly si el problema continúa.",
    retry: "Reintentar",
  },
  "pt-BR": {
    title: "Algo deu errado",
    body: "O aplicativo não conseguiu exibir esta página. Tente novamente ou volte ao Harly se o problema continuar.",
    retry: "Tentar novamente",
  },
  de: {
    title: "Etwas ist schiefgelaufen",
    body: "Die Anwendung konnte diese Seite nicht anzeigen. Versuche es noch einmal oder kehre zu Harly zurück, wenn das Problem bestehen bleibt.",
    retry: "Erneut versuchen",
  },
  fr: {
    title: "Un problème est survenu",
    body: "L’application n’a pas pu afficher cette page. Réessayez, ou revenez à Harly si le problème persiste.",
    retry: "Réessayer",
  },
  "nl-NL": {
    title: "Er is iets misgegaan",
    body: "De applicatie kon deze pagina niet weergeven. Probeer het opnieuw of ga terug naar Harly als het probleem aanhoudt.",
    retry: "Opnieuw proberen",
  },
};

const subscribeToLanguage = (notify: () => void) => {
  window.addEventListener("languagechange", notify);
  return () => window.removeEventListener("languagechange", notify);
};

/**
 * Global fallback deliberately has no application providers. Next can render
 * this boundary while the root tree is unavailable, so it must not depend on
 * ThemeProvider, Toaster, or any context-backed client component.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // Server render and hydration use English; the browser language applies after.
  const locale = useSyncExternalStore<Locale>(
    subscribeToLanguage,
    () => negotiateLocale(navigator.languages?.join(",") ?? navigator.language),
    () => defaultLocale,
  );
  const t = copy[locale];
  return (
    <html lang={locale}>
      <head>
        <meta name="color-scheme" content="light dark" />
        <style>{`
          :root{color-scheme:light dark;--ge-bg:#f5f5f4;--ge-fg:#171717;--ge-muted:#5f5f5c;--ge-card:#ffffff;--ge-line:#e4e4e1;--ge-shadow:rgba(23,23,23,.08)}
          @media (prefers-color-scheme: dark){:root{--ge-bg:#161614;--ge-fg:#f2f2ef;--ge-muted:#a8a8a3;--ge-card:#1d1d1b;--ge-line:#33332f;--ge-shadow:rgba(0,0,0,.4)}}
        `}</style>
      </head>
      <body style={{ margin: 0, minHeight: "100vh", fontFamily: "system-ui, sans-serif", background: "var(--ge-bg)", color: "var(--ge-fg)" }}>
        <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: "2rem" }}>
          <section style={{ maxWidth: 520, border: "1px solid var(--ge-line)", borderRadius: 16, background: "var(--ge-card)", padding: "2rem", boxShadow: "0 12px 40px var(--ge-shadow)" }}>
            <p style={{ margin: 0, color: "var(--ge-muted)", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Harly</p>
            <h1 style={{ margin: "1rem 0 .5rem", fontSize: 28 }}>{t.title}</h1>
            <p style={{ margin: 0, color: "var(--ge-muted)", lineHeight: 1.6 }}>{t.body}</p>
            <button type="button" onClick={() => retry()} style={{ marginTop: "1.5rem", cursor: "pointer", border: 0, borderRadius: 8, background: "#b8f04a", color: "#23300a", padding: ".7rem 1rem", fontWeight: 700 }}>{t.retry}</button>
          </section>
        </main>
      </body>
    </html>
  );
}
