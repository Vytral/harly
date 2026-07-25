import type { Metadata } from "next";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";

import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CookiePanel } from "@/components/CookieConsentBanner";

import "./globals.css";

// Onest is the only UI family (DESIGN.md, Tokens , Typography). Two faces, a
// hard role split: the static instances *speak* (body, buttons, names, nav,
// greetings , display weight is 600 + tight tracking, not another family), the
// variable face *labels* (pills, statuses, badges, column heads at 11,13px,
// where a live weight axis buys density without buying size).
// Self-hosted (F5-04) so the build never reaches fonts.googleapis.com.
const onest = localFont({
  src: [
    { path: "./fonts/onest/onest-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/onest/onest-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/onest/onest-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-onest",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

const onestVariable = localFont({
  src: "./fonts/onest/onest-latin-variable.woff2",
  variable: "--font-onest-var",
  weight: "100 900",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.HARLY_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000",
  ),
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
      className={`${onest.variable} ${onestVariable.variable} ${GeistMono.variable} h-full antialiased`}
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
          defaultTheme="system"
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
