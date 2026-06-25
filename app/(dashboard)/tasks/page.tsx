import { createClient } from "@/lib/supabase/server";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import { TaskItem, type TaskRow } from "@/components/tasks/TaskItem";
import { roleFromEmail } from "@/lib/tasks/shared";
import { ListChecks } from "lucide-react";

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const defaultRole = roleFromEmail(user?.email);

  const [{ data: open }, { data: done }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, description, due_date, assigned_to, status, job_id, job:jobs(title)")
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("tasks")
      .select("id, title, description, due_date, assigned_to, status, job_id, job:jobs(title)")
      .eq("status", "done")
      .order("completed_at", { ascending: false })
      .limit(20),
  ]);

  const openTasks = (open ?? []) as unknown as TaskRow[];
  const doneTasks = (done ?? []) as unknown as TaskRow[];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ListChecks className="h-6 w-6" /> Tasks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Open to-dos for Travis and Carol. Tasks with a due date show on the calendar and send a daily reminder until done.
          </p>
        </div>
      </div>

      <AddTaskForm defaultRole={defaultRole} />

      {openTasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ListChecks className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nothing open. Add a task above or from any job.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {openTasks.map((t) => (
            <TaskItem key={t.id} task={t} />
          ))}
        </div>
      )}

      {doneTasks.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500 pt-2">Recently completed</h2>
          {doneTasks.map((t) => (
            <TaskItem key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}
