import localFont from "next/font/local";

// Cal Sans , geometric, friendly display face. Used only inside focus-mode
// builder chrome (topbar pill, panel + section headings), never the live
// preview, which honours the user's own theme.font.
const calSans = localFont({
  src: "../fonts/CalSans.woff2",
  variable: "--font-cal",
  weight: "600",
  display: "swap",
});

/**
 * Focus-mode route group. Deliberately bare: no AppSidebar, no global TopBar,
 * no padded <main>. Global providers (ThemeProvider, Tooltip, Toaster) live in
 * the root layout above this group, so editors here still get them. Auth / org
 * / 2FA is enforced by proxy.ts on the /dashboard prefix , the URL is unchanged
 * by this route group, so no guard is needed here.
 */
export default function FullscreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${calSans.variable} h-dvh w-full overflow-hidden bg-paper`}>
      {children}
    </div>
  );
}
