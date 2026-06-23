import { listTasks, getTaskCounts, listWorkspaceMembers } from "@/features/tasks/data";
import { TasksView } from "@/features/tasks/TasksView";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [tasks, counts, members] = await Promise.all([
    listTasks(),
    getTaskCounts(),
    listWorkspaceMembers(),
  ]);

  return <TasksView tasks={tasks} members={members} counts={counts} />;
}
