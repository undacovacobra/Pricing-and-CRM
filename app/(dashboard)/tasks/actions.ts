"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { roleFromEmail, normalizeRole, taskCalendarStart, type TaskRole } from "@/lib/tasks/shared";

async function currentRole(): Promise<{ role: TaskRole; email: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { role: roleFromEmail(user?.email), email: user?.email ?? null };
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  due_date?: string | null;
  assigned_to?: string | null;
  job_id?: string | null;
}

export async function createTask(input: CreateTaskInput): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "A title is required." };

  const { role } = await currentRole();
  const assigned = normalizeRole(input.assigned_to, role);
  const dueDate = input.due_date || null;

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description: input.description?.trim() || null,
      due_date: dueDate,
      assigned_to: assigned,
      job_id: input.job_id || null,
      status: "open",
      created_by: role,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // With a due date, drop a reminder onto the calendar for the owner.
  if (dueDate && task) {
    const { data: ev } = await supabase
      .from("calendar_events")
      .insert({
        title: `Task: ${title}`,
        event_type: "task",
        assigned_to: assigned,
        job_id: input.job_id || null,
        start_time: taskCalendarStart(dueDate),
        status: "scheduled",
        notes: input.description?.trim() || null,
      })
      .select("id")
      .single();
    if (ev) await supabase.from("tasks").update({ calendar_event_id: ev.id }).eq("id", task.id);
  }

  revalidatePath("/tasks");
  revalidatePath("/calendar");
  if (input.job_id) revalidatePath(`/jobs/${input.job_id}`);
  return { ok: true };
}

export async function completeTask(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("calendar_event_id, job_id").eq("id", id).maybeSingle();
  await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  // Clear its calendar reminder so it stops showing / reminding.
  if (task?.calendar_event_id) {
    await supabase.from("calendar_events").update({ status: "cancelled" }).eq("id", task.calendar_event_id);
  }
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  if (task?.job_id) revalidatePath(`/jobs/${task.job_id}`);
  return { ok: true };
}

export async function reopenTask(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("calendar_event_id, job_id").eq("id", id).maybeSingle();
  await supabase
    .from("tasks")
    .update({ status: "open", completed_at: null, last_reminded_on: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (task?.calendar_event_id) {
    await supabase.from("calendar_events").update({ status: "scheduled" }).eq("id", task.calendar_event_id);
  }
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  if (task?.job_id) revalidatePath(`/jobs/${task.job_id}`);
  return { ok: true };
}

export async function deleteTask(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("calendar_event_id, job_id").eq("id", id).maybeSingle();
  if (task?.calendar_event_id) await supabase.from("calendar_events").delete().eq("id", task.calendar_event_id);
  await supabase.from("tasks").delete().eq("id", id);
  revalidatePath("/tasks");
  revalidatePath("/calendar");
  if (task?.job_id) revalidatePath(`/jobs/${task.job_id}`);
  return { ok: true };
}
