import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DrawingsList } from "@/components/drawings/DrawingsList";
import type { JobDrawing } from "@/lib/types/database";

export default async function JobDrawingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase.from("jobs").select("id, title").eq("id", id).single();
  if (!job) notFound();

  const { data: drawings } = await supabase
    .from("job_drawings")
    .select("*")
    .eq("job_id", id)
    .order("sort_order", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/jobs/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← {job.title}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Drawings</h1>
      </div>
      <DrawingsList jobId={id} drawings={(drawings ?? []) as JobDrawing[]} />
    </div>
  );
}
