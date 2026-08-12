import type { MetadataRoute } from "next";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = getHarlyPublicOrigin();
  return {
    rules: [{ userAgent: "*", allow: ["/board/"], disallow: ["/api/", "/dashboard/", "/settings/", "/portal/", "/login", "/signup", "/apply/"] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
