"use client";
import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Trash2, CalendarClock, Briefcase } from "lucide-react";
import { completeTask, reopenTask, deleteTask } from "@/app/(dashboard)/tasks/actions";
import { taskPersonLabel } from "@/lib/tasks/shared";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  assigned_to: string;
  status: string;
  job_id: string | null;
  job?: { title: string } | null;
}

function dueLabel(due: string | null): { text: string; tone: string } {
  if (!due) return { text: "No due date", tone: "text-slate-400" };
  // Compare as plain calendar dates (the due date has no time).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const d = new Date(`${due}T12:00:00`);
  const pretty = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (due < today) return { text: `Overdue · ${pretty}`, tone: "text-red-600 font-medium" };
  if (due === today) return { text: "Due today", tone: "text-amber-600 font-medium" };
  return { text: `Due ${pretty}`, tone: "text-slate-500" };
}

export function TaskItem({ task, showJob = true }: { task: TaskRow; showJob?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const done = task.status === "done";
  const due = dueLabel(task.due_date);

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
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
