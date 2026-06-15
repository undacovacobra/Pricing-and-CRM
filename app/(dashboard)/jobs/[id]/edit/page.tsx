import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { JobForm } from "@/components/jobs/JobForm";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: job }, { data: customers }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).single(),
    supabase.from("customers").select("*").order("last_name"),
  ]);

  if (!job) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={`/jobs/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← {job.title}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Edit Job</h1>
      </div>
      <JobForm job={job} customers={customers ?? []} />
    </div>
  );
}
