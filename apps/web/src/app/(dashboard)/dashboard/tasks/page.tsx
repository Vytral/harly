import { ListTodo } from "lucide-react";

import { ComingSoon } from "@/components/ComingSoon";

export default function TasksPage() {
  return (
    <ComingSoon
      icon={ListTodo}
      title="Tasks"
      description="Reminders and to-dos for your hiring, with due dates and owners across your team."
    />
  );
}
