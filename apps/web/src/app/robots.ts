import type { MetadataRoute } from "next";
import { getHarlyPublicOrigin } from "@/lib/public-origin";

const origin = getHarlyPublicOrigin();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/board/"], disallow: ["/api/", "/dashboard/", "/settings/", "/portal/", "/login", "/signup", "/apply/"] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
