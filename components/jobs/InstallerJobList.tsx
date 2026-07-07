import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { JobStageBadge } from "@/components/jobs/JobStageBadge";
import { MapPin } from "lucide-react";
import type { JobStage } from "@/lib/types/database";

interface InstallerJobRow {
  id: string;
  title: string;
  stage: string;
  job_address: string | null;
  customer?: { first_name: string | null; last_name: string | null } | null;
}

// Read-only job list for installers — title, customer, address, stage. No values.
export function InstallerJobList({ jobs }: { jobs: InstallerJobRow[] }) {
  if (!jobs.length) {
    return <p className="text-sm text-muted-foreground text-center py-12">No jobs yet.</p>;
  }
  return (
    <div className="space-y-2">
      {jobs.map((job) => {
        const cust = job.customer ? `${job.customer.first_name ?? ""} ${job.customer.last_name ?? ""}`.trim() : "";
        return (
          <Link key={job.id} href={`/jobs/${job.id}`}>
            <Card className="hover:shadow-sm transition-shadow">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{job.title}</p>
                  {cust && <p className="text-xs text-muted-foreground truncate">{cust}</p>}
                  {job.job_address && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{job.job_address}</span>
                    </p>
                  )}
                </div>
                <JobStageBadge stage={job.stage as JobStage} />
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
