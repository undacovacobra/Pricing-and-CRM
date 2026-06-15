import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { JobForm } from "@/components/jobs/JobForm";

async function NewJobContent() {
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .order("last_name", { ascending: true });

  return <JobForm customers={customers ?? []} />;
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
