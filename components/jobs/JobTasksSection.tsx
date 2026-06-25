"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListChecks } from "lucide-react";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import { TaskItem, type TaskRow } from "@/components/tasks/TaskItem";

// Tasks attached to a single job, shown on the job detail page.
export function JobTasksSection({
  jobId,
  defaultRole,
  tasks,
}: {
  jobId: string;
  defaultRole: "owner" | "designer";
  tasks: TaskRow[];
}) {
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Tasks
        </CardTitle>
        <AddTaskForm defaultRole={defaultRole} jobId={jobId} />
      </CardHeader>
      <CardContent className="space-y-2">
        {open.length === 0 && done.length === 0 && (
          <p className="text-sm text-muted-foreground">No tasks for this job yet.</p>
        )}
        {open.map((t) => (
          <TaskItem key={t.id} task={t} showJob={false} />
        ))}
        {done.length > 0 && (
          <>
            <p className="text-xs font-semibold text-slate-400 pt-2">Completed</p>
            {done.map((t) => (
              <TaskItem key={t.id} task={t} showJob={false} />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
