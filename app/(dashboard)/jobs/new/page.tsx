import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { JobForm } from "@/components/jobs/JobForm";
import { roleFromEmail } from "@/lib/tasks/shared";

async function NewJobContent() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: customers }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("customers").select("*").order("last_name", { ascending: true }),
  ]);
  const defaultRole = roleFromEmail(user?.email);

  return <JobForm customers={customers ?? []} defaultRole={defaultRole} />;
}

export default function NewJobPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/jobs" className="text-sm text-muted-foreground hover:underline">
          ← Jobs
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">New Job</h1>
      </div>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
        <NewJobContent />
      </Suspense>
    </div>
  );
}
