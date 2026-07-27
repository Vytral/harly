import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import {
  getUnreadNotificationCount,
  listNotifications,
} from "@/features/notifications/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!(await getWorkspaceContextOrNull())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(1, rawLimit))
    : 50;
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(limit),
    getUnreadNotificationCount(),
  ]);
  return Response.json(
    { notifications, unreadCount },
    { headers: { "Cache-Control": "no-store" } },
  );
}
