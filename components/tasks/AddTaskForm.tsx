"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTask } from "@/app/(dashboard)/tasks/actions";

// Compact add-task form, reused on the Tasks page, the calendar page, and inside
// a job. When jobId is set the task is linked to that job (and the job picker is
// hidden); otherwise the optional `jobs` list powers an "attach to job" select.
export function AddTaskForm({
  defaultRole,
  jobId,
  jobs,
}: {
  defaultRole: "owner" | "designer";
  jobId?: string;
  jobs?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [assignedTo, setAssignedTo] = useState<"owner" | "designer">(defaultRole);
  const [jobChoice, setJobChoice] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createTask({
        title,
        due_date: dueDate || null,
        due_time: dueDate && dueTime ? dueTime : null,
        assigned_to: assignedTo,
        job_id: jobId ?? (jobChoice || null),
      });
      if (!res.ok) {
        setError(res.error || "Could not add the task.");
        return;
      }
      setTitle("");
      setDueDate("");
      setDueTime("");
      setJobChoice("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add task
      </Button>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-3 space-y-2">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="What needs doing?"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-500">
          Due
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="ml-1 rounded-md border px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-slate-500">
          Time
          <input
            type="time"
            step={900}
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            disabled={!dueDate}
            className="ml-1 rounded-md border px-2 py-1 text-sm disabled:opacity-50"
          />
        </label>
        <label className="text-xs text-slate-500">
          For
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value as "owner" | "designer")}
            className="ml-1 rounded-md border px-2 py-1 text-sm"
          >
            <option value="owner">Travis</option>
            <option value="designer">Carol</option>
          </select>
        </label>
      </div>

      {!jobId && jobs && jobs.length > 0 && (
        <label className="block text-xs text-slate-500">
          Attach to job
          <select
            value={jobChoice}
            onChange={(e) => setJobChoice(e.target.value)}
            className="mt-1 block w-full rounded-md border px-2 py-1.5 text-sm"
          >
            <option value="">— None —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-center gap-2">
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={pending || !title.trim()}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>
      {!dueDate && <p className="text-xs text-slate-400">No due date = it just stays on the list (no daily reminders).</p>}
    </div>
  );
}
