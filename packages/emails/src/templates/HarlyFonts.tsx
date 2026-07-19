import { Font } from "@react-email/components";

// Inter, loaded as a web font for email rendering. The web app self-hosts
// Inter (apps/web/src/app/layout.tsx → ./fonts/inter.woff2) and uses it for
// both body and display, so emails stay typographically coherent with the
// product. Gmail strips <style> web-font @font-face, but Apple Mail and
// Outlook (Mac/web/mobile) honour it; clients without support fall back to
// Arial/Helvetica (declared below), which is a clean, neutral fallback.
//
// Weights mirror the web app usage: 400 body, 500 emphasis, 600/700 headings.
export function HarlyFonts() {
  return (
    <>
      <Font
        fontFamily="Inter"
        fallbackFontFamily={["Arial", "Helvetica", "sans-serif"]}
        webFont={{
          url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuOKfMZg.ttf",
          format: "truetype",
        }}
        fontWeight={400}
        fontStyle="normal"
      />
      <Font
        fontFamily="Inter"
        fallbackFontFamily={["Arial", "Helvetica", "sans-serif"]}
        webFont={{
          url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2",
          format: "woff2",
        }}
        fontWeight={500}
        fontStyle="normal"
      />
      <Font
        fontFamily="Inter"
        fallbackFontFamily={["Arial", "Helvetica", "sans-serif"]}
        webFont={{
          url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf",
          format: "truetype",
        }}
        fontWeight={600}
        fontStyle="normal"
      />
      <Font
        fontFamily="Inter"
        fallbackFontFamily={["Arial", "Helvetica", "sans-serif"]}
        webFont={{
          url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKfMZg.ttf",
          format: "truetype",
        }}
        fontWeight={700}
        fontStyle="normal"
      />
    </>
  );
}
