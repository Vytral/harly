import {
  getTaskCounts,
  listTaskContextOptions,
  listTasks,
  listWorkspaceMembers,
} from "@/features/tasks/data";
import { TasksView } from "@/features/tasks/TasksView";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  await requirePagePermission("tasks:read");
  const { user } = await getWorkspaceContext();
  const [tasks, counts, members, contextOptions] = await Promise.all([
    listTasks(),
    getTaskCounts(),
    listWorkspaceMembers(),
    listTaskContextOptions(),
  ]);

  return (
    <TasksView
      tasks={tasks}
      members={members}
      counts={counts}
      contextOptions={contextOptions}
      currentUserId={user.id}
    />
  );
}
