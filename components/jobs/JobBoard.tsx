"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { JobStageBadge, JOB_STAGES } from "@/components/jobs/JobStageBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Search } from "lucide-react";
import type { Job, JobStage } from "@/lib/types/database";

interface JobWithCustomer extends Job {
  customer: { first_name: string; last_name: string } | null;
}

export function JobBoard({ jobs }: { jobs: JobWithCustomer[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    const terms = q.split(/\s+/);
    return jobs.filter((j) => {
      const stageLabel = JOB_STAGES.find((s) => s.value === j.stage)?.label ?? "";
      const haystack = [
        j.title,
        j.description,
        j.job_address,
        j.notes,
        j.assigned_to,
        stageLabel,
        j.customer ? `${j.customer.first_name} ${j.customer.last_name}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [jobs, query]);

  const activeStages = JOB_STAGES.filter((s) => !["finished", "cancelled"].includes(s.value));
  const jobsByStage = activeStages.map((stage) => ({
    ...stage,
    jobs: jobs.filter((j) => j.stage === stage.value),
  }));
  const completedJobs = jobs.filter((j) => j.stage === "finished");

  const searching = query.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, customer, address, notes, stage..."
          className="pl-9"
        />
      </div>

      {searching ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </p>
          {filtered.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No jobs match &ldquo;{query}&rdquo;.</p>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-2">
            {filtered.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{job.title}</p>
                      {job.customer && (
                        <p className="text-xs text-muted-foreground">
                          {job.customer.first_name} {job.customer.last_name}
                        </p>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <JobStageBadge stage={job.stage as JobStage} />
                      {job.estimated_value && (
                        <p className="text-xs font-medium text-green-700">
                          {formatCurrency(job.estimated_value)}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Kanban-style columns (horizontal scroll on mobile, grid on desktop) */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max md:min-w-0 md:grid md:grid-cols-4">
              {jobsByStage.map(({ value, jobs: stageJobs }) => (
                <div key={value} className="w-64 md:w-auto space-y-2">
                  <div className="flex items-center justify-between">
                    <JobStageBadge stage={value as JobStage} />
                    <span className="text-xs text-muted-foreground">{stageJobs.length}</span>
                  </div>
                  <div className="space-y-2">
                    {stageJobs.length === 0 && (
                      <div className="border-2 border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                        No jobs
                      </div>
                    )}
                    {stageJobs.map((job) => (
                      <Link key={job.id} href={`/jobs/${job.id}`}>
                        <Card className="hover:shadow-md transition-shadow cursor-pointer">
                          <CardContent className="p-3">
                            <p className="text-sm font-medium leading-tight">{job.title}</p>
                            {job.customer && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {job.customer.first_name} {job.customer.last_name}
                              </p>
                            )}
                            {job.estimated_value && (
                              <p className="text-xs font-medium text-green-700 mt-2">
                                {formatCurrency(job.estimated_value)}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Completed Jobs */}
          {completedJobs.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold text-slate-500 text-sm uppercase tracking-wide">
                Completed ({completedJobs.length})
              </h2>
              <div className="grid gap-2">
                {completedJobs.map((job) => (
                  <Link key={job.id} href={`/jobs/${job.id}`}>
                    <Card className="hover:shadow-sm transition-shadow opacity-70 hover:opacity-100">
                      <CardContent className="flex items-center justify-between p-3">
                        <div>
                          <p className="text-sm font-medium">{job.title}</p>
                          {job.customer && (
                            <p className="text-xs text-muted-foreground">
                              {job.customer.first_name} {job.customer.last_name}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <JobStageBadge stage="finished" />
                          {job.actual_end_date && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(job.actual_end_date)}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
