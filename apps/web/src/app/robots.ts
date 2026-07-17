import type { MetadataRoute } from "next";

const origin = (process.env.HARLY_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/board/"], disallow: ["/api/", "/dashboard/", "/settings/", "/portal/", "/login", "/signup", "/apply/"] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
