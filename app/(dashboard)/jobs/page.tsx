import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { JobBoard } from "@/components/jobs/JobBoard";
import { InstallerJobList } from "@/components/jobs/InstallerJobList";
import { roleFromUser } from "@/lib/auth/roles";

export default async function JobsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const installer = roleFromUser(user) === "installer";

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*, customer:customers!jobs_customer_id_fkey(first_name, last_name)")
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
        {!installer && (
          <Button asChild size="sm">
            <Link href="/jobs/new">
              <Plus className="h-4 w-4" />
              New Job
            </Link>
          </Button>
        )}
      </div>

      {installer ? <InstallerJobList jobs={jobs ?? []} /> : <JobBoard jobs={jobs ?? []} />}
    </div>
  );
}
