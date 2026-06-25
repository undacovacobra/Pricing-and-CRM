import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToAll } from "@/lib/push/send";
import { emailForRole, taskPersonLabel, type TaskRole } from "@/lib/tasks/shared";

const APP_TIME_ZONE = "America/New_York";

function easternToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(new Date());
}

// Reminds each task's owner, once per day, about open tasks that are due today
// or overdue — and keeps reminding every day until the task is completed.
// Idempotent within a day via last_reminded_on. Returns how many pushes went out.
export async function runDueTaskReminders(db: SupabaseClient): Promise<number> {
  const today = easternToday();

  const { data: tasks } = await db
    .from("tasks")
    .select("id, title, assigned_to, due_date, last_reminded_on, job_id, job:jobs(title)")
    .eq("status", "open")
    .not("due_date", "is", null)
    .lte("due_date", today);

  if (!tasks?.length) return 0;

  let sent = 0;
  for (const t of tasks) {
    if (t.last_reminded_on === today) continue; // already nudged today

    const role = (t.assigned_to as TaskRole) || "owner";
    const job = t.job as { title?: string } | null;
    const overdue = (t.due_date as string) < today;
    const n = await sendPushToAll(
      db,
      {
        title: overdue ? `Still open: ${t.title}` : `Due today: ${t.title}`,
        body: `${taskPersonLabel(role)}${job?.title ? ` · ${job.title}` : ""} — tap to mark it done.`,
        url: "/tasks",
        tag: `task-${t.id}`,
      },
      [emailForRole(role)],
    );
    await db.from("tasks").update({ last_reminded_on: today }).eq("id", t.id);
    if (n > 0) sent++;
  }
  return sent;
}
