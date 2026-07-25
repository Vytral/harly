/**
 * Focus-mode route group. Deliberately bare: no AppSidebar, no global TopBar,
 * no padded <main>. Global providers (ThemeProvider, Tooltip, Toaster) live in
 * the root layout above this group, so editors here still get them. Auth / org
 * / 2FA is enforced by proxy.ts on the /dashboard prefix , the URL is unchanged
 * by this route group, so no guard is needed here.
 *
 * No font is registered here on purpose: Onest is the single family (DESIGN.md),
 * inherited from the root layout. Builder chrome used to load Cal Sans as a
 * third display face , `.font-cal` now resolves to Onest 600 tight in
 * globals.css, so existing call sites keep working without a second download.
 */
export default function FullscreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-dvh w-full overflow-hidden bg-paper">{children}</div>
  );
}
