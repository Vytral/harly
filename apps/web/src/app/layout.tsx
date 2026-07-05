import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Inter, Fraunces } from "next/font/google";

import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CookiePanel } from "@/components/CookieConsentBanner";

import "./globals.css";

// Inter carries both body and display roles (bold + tight tracking for
// headings) — single-family system per the off-white/lime design language.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Fraunces is the editorial display face for the Folio career template only —
// a variable serif with optical sizing and a "soft" axis. Loaded here so the
// CSS variable is always available; templates opt in via `.font-fraunces`.
// `opsz` keeps body-sized text crisp while headings get the display cut.
// Variable font → no fixed weight/style, the full range is available.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  title: "Harly",
  description: "Open-source applicant tracking system for modern teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${GeistMono.variable} ${GeistSans.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <head>
        <link rel="preconnect" href="https://lh3.googleusercontent.com" />
        <link rel="preconnect" href="https://www.gravatar.com" />
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
        <link rel="dns-prefetch" href="https://www.gravatar.com" />
      </head>
      <body className="min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="bottom-right" richColors closeButton />
          <CookiePanel />
        </ThemeProvider>
      </body>
    </html>
  );
}
