import { ListChecks } from "lucide-react";
import Link from "next/link";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import { TaskItem, type TaskRow } from "@/components/tasks/TaskItem";

// The open-tasks list shown beneath the month calendar on the Calendar page.
export function CalendarTasks({
  tasks,
  defaultRole,
  jobs,
}: {
  tasks: TaskRow[];
  defaultRole: "owner" | "designer";
  jobs: { id: string; title: string }[];
}) {
  return (
    <div className="space-y-3 border-t pt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <ListChecks className="h-5 w-5" /> Tasks
        </h2>
        <div className="flex items-center gap-2">
          <Link href="/tasks" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
          <AddTaskForm defaultRole={defaultRole} jobs={jobs} />
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open tasks. Add one above.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskItem key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}
