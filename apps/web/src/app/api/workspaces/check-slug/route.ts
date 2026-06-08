import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db, organization } from "@harly/db";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.json({ available: false }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get("slug")?.trim().toLowerCase();

  if (!slug) {
    return NextResponse.json({ available: false });
  }

  const [authOrganization] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1);

  return NextResponse.json({ available: !authOrganization });
}
