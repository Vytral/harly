import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  return NextResponse.json(session);
}
