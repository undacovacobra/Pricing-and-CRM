import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PhotoGallery } from "@/components/photos/PhotoGallery";

export default async function JobPhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase.from("jobs").select("id, title").eq("id", id).single();
  if (!job) notFound();

  const { data: photos } = await supabase
    .from("job_photos")
    .select("*")
    .eq("job_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/jobs/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← {job.title}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Photos</h1>
      </div>
      <PhotoGallery jobId={id} photos={photos ?? []} />
    </div>
  );
}
