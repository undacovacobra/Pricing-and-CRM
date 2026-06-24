import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DrawingCanvas } from "@/components/drawings/DrawingCanvas";
import type { JobDrawing } from "@/lib/types/database";

export default async function JobDrawingEditPage({ params }: { params: Promise<{ id: string; drawingId: string }> }) {
  const { id, drawingId } = await params;
  const supabase = await createClient();

  const { data: drawing } = await supabase.from("job_drawings").select("*").eq("id", drawingId).eq("job_id", id).single();
  if (!drawing) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/jobs/${id}/drawings`} className="text-sm text-muted-foreground hover:underline">
        ← Drawings
      </Link>
      <DrawingCanvas jobId={id} drawing={drawing as JobDrawing} />
    </div>
  );
}
