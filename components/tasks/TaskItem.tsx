"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Trash2, CalendarClock, Briefcase, Pencil } from "lucide-react";
import { completeTask, reopenTask, deleteTask, updateTask } from "@/app/(dashboard)/tasks/actions";
import { taskPersonLabel } from "@/lib/tasks/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeSelect } from "@/components/ui/time-select";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time?: string | null;
  assigned_to: string;
  status: string;
  job_id: string | null;
  job?: { title: string } | null;
}

function prettyTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dueLabel(due: string | null, time?: string | null): { text: string; tone: string } {
  if (!due) return { text: "No due date", tone: "text-slate-400" };
  // Compare as plain calendar dates (the due date has no time).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const d = new Date(`${due}T12:00:00`);
  const pretty = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const at = time && /^\d{2}:\d{2}$/.test(time) ? ` at ${prettyTime(time)}` : "";
  if (due < today) return { text: `Overdue · ${pretty}${at}`, tone: "text-red-600 font-medium" };
  if (due === today) return { text: `Due today${at}`, tone: "text-amber-600 font-medium" };
  return { text: `Due ${pretty}${at}`, tone: "text-slate-500" };
}

export function TaskItem({ task, showJob = true }: { task: TaskRow; showJob?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const done = task.status === "done";
  const due = dueLabel(task.due_date, task.due_time);

  // Inline editing.
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [dueTime, setDueTime] = useState(task.due_time ?? "");
  const [assignedTo, setAssignedTo] = useState<"owner" | "designer">(task.assigned_to === "designer" ? "designer" : "owner");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function saveEdit() {
    if (!title.trim()) { setError("A title is required."); return; }
    setError(null);
    startTransition(async () => {
      const res = await updateTask({
        id: task.id,
        title,
        description: description || null,
        due_date: dueDate || null,
        due_time: dueDate && dueTime ? dueTime : null,
        assigned_to: assignedTo,
      });
      if (!res.ok) { setError(res.error || "Could not save."); return; }
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="rounded-lg border bg-white p-3 space-y-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" autoFocus />
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes (optional)" />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500">
            Due
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="ml-1 rounded-md border px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-slate-500">
            Time
            <TimeSelect value={dueTime} onChange={setDueTime} disabled={!dueDate} allowEmpty className="ml-1 rounded-md border px-2 py-1 text-sm disabled:opacity-50" />
          </label>
          <label className="text-xs text-slate-500">
            For
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value as "owner" | "designer")} className="ml-1 rounded-md border px-2 py-1 text-sm">
              <option value="owner">Travis</option>
              <option value="designer">Carol</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setError(null); }} disabled={pending}>Cancel</Button>
            <Button size="sm" onClick={saveEdit} disabled={pending || !title.trim()}>{pending ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-3 rounded-lg border bg-white px-3 py-2.5 ${pending ? "opacity-60" : ""}`}>
      <button
        onClick={() => run(() => (done ? reopenTask(task.id) : completeTask(task.id)))}
        disabled={pending}
        aria-label={done ? "Reopen task" : "Mark complete"}
        title={done ? "Reopen" : "Mark complete"}
        className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border flex items-center justify-center ${
          done ? "bg-green-600 border-green-600 text-white" : "border-slate-300 hover:border-green-600"
        }`}
      >
        {done && <Check className="h-3.5 w-3.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? "line-through text-slate-400" : "text-slate-900"}`}>{task.title}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs">
          {!done && (
            <span className={`inline-flex items-center gap-1 ${due.tone}`}>
              <CalendarClock className="h-3 w-3" /> {due.text}
            </span>
          )}
          <span className="text-slate-400">{taskPersonLabel(task.assigned_to)}</span>
          {showJob && task.job_id && task.job?.title && (
            <Link href={`/jobs/${task.job_id}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              <Briefcase className="h-3 w-3" /> {task.job.title}
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {done && (
          <button onClick={() => run(() => reopenTask(task.id))} disabled={pending} title="Reopen" className="p-1 text-slate-400 hover:text-slate-700">
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => setEditing(true)}
          disabled={pending}
          title="Edit"
          className="p-1 text-slate-400 hover:text-slate-700"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            if (confirm("Delete this task?")) run(() => deleteTask(task.id));
          }}
          disabled={pending}
          title="Delete"
          className="p-1 text-slate-400 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
