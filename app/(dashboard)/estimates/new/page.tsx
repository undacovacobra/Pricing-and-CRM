import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewEstimateForm } from "@/components/estimates/NewEstimateForm";

export default async function NewEstimatePage() {
  const supabase = await createClient();

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, customer:customers(first_name, last_name)")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link href="/estimates" className="text-sm text-muted-foreground hover:underline">
          ← Estimates
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">New Estimate</h1>
        <p className="text-sm text-muted-foreground">Choose the job this estimate is for.</p>
      </div>
      <NewEstimateForm
        jobs={
          (jobs ?? []) as unknown as {
            id: string;
            title: string;
            customer: { first_name: string; last_name: string | null } | null;
          }[]
        }
      />
    </div>
  );
}
