import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";

import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CookiePanel } from "@/components/CookieConsentBanner";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { themeBootstrapScript } from "@/lib/theme-bootstrap";

import "./globals.css";

// Instrument Sans is the UI family: one variable face (wght 400–700) covers
// body, chrome labels and display. Self-hosted so the build never reaches
// fonts.googleapis.com.
const instrumentSans = localFont({
  src: [
    { path: "./fonts/instrument-sans/instrument-sans-latin-wght-normal.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/instrument-sans/instrument-sans-latin-wght-italic.woff2", weight: "400 700", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

export const dynamic = "force-dynamic";

// Browser chrome follows the device scheme until a stored preference overrides
// it (the bootstrap script rewrites these metas). Colors are --warm-paper.
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#161614" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(getHarlyPublicOrigin()),
    title: "Harly",
    description: "Open-source applicant tracking system for modern teams.",
    icons: {
      icon: "/favicon.svg",
    },
    // iOS Safari otherwise rewrites phone numbers, dates and addresses into
    // links before hydration, which breaks it (seen on candidate pages).
    formatDetection: { telephone: false, date: false, address: false, email: false },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${GeistMono.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <head>
        {/* Applies the stored theme before first paint; see lib/theme-bootstrap.ts. */}
        <Script
          id="theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript() }}
        />
        <link rel="preconnect" href="https://lh3.googleusercontent.com" />
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
      </head>
      <body className="min-h-full">
        <NextIntlClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider delayDuration={200}>
              <ConfirmProvider>{children}</ConfirmProvider>
            </TooltipProvider>
            <Toaster position="bottom-center" closeButton />
            <CookiePanel />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
