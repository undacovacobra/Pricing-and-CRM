import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { JobStageBadge, JOB_STAGES } from "@/components/jobs/JobStageBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { JobStage } from "@/lib/types/database";

export default async function JobsPage() {
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*, customer:customers(first_name, last_name)")
    .order("updated_at", { ascending: false });

  const activeStages = JOB_STAGES.filter((s) =>
    !["complete", "cancelled"].includes(s.value)
  );

  const jobsByStage = activeStages.map((stage) => ({
    ...stage,
    jobs: jobs?.filter((j) => j.stage === stage.value) ?? [],
  }));

  const completedJobs = jobs?.filter((j) => j.stage === "complete") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
        <Button asChild size="sm">
          <Link href="/jobs/new">
            <Plus className="h-4 w-4" />
            New Job
          </Link>
        </Button>
      </div>

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
                {stageJobs.map((job) => {
                  const customer = job.customer as { first_name: string; last_name: string } | null;
                  return (
                    <Link key={job.id} href={`/jobs/${job.id}`}>
                      <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardContent className="p-3">
                          <p className="text-sm font-medium leading-tight">{job.title}</p>
                          {customer && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {customer.first_name} {customer.last_name}
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
                  );
                })}
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
            {completedJobs.map((job) => {
              const customer = job.customer as { first_name: string; last_name: string } | null;
              return (
                <Link key={job.id} href={`/jobs/${job.id}`}>
                  <Card className="hover:shadow-sm transition-shadow opacity-70 hover:opacity-100">
                    <CardContent className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium">{job.title}</p>
                        {customer && (
                          <p className="text-xs text-muted-foreground">
                            {customer.first_name} {customer.last_name}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <JobStageBadge stage="complete" />
                        {job.actual_end_date && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDate(job.actual_end_date)}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
