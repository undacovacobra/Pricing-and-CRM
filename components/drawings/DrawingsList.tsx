"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { putDrawing, getDrawing } from "@/lib/offline/db";
import type { JobDrawing } from "@/lib/types/database";

// Cache a drawing for offline use, but never clobber unsynced local edits.
async function getCachedAndStore(d: JobDrawing, jobId: string) {
  const local = await getDrawing(d.id);
  if (local?.pendingSync) return;
  putDrawing({
    id: d.id,
    job_id: jobId,
    label: d.label,
    strokes: d.strokes ?? [],
    thumbnail: d.thumbnail ?? null,
    sort_order: d.sort_order ?? 0,
    updated_at: d.updated_at ?? new Date().toISOString(),
    pendingSync: false,
  });
}

export function DrawingsList({ jobId, drawings }: { jobId: string; drawings: JobDrawing[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [creating, setCreating] = useState(false);

  // Cache each drawing locally so opened pages are editable offline later.
  useEffect(() => {
    for (const d of drawings) {
      getCachedAndStore(d, jobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings]);

  async function addPage() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      alert(
        "You're offline. New drawing pages need a connection to set up — open the pages you'll need while you have signal, then you can keep drawing and saving on them offline.",
      );
      return;
    }
    setCreating(true);
    const nextLabel = `Page ${drawings.length + 1}`;
    const { data } = await supabase
      .from("job_drawings")
      .insert({ job_id: jobId, label: nextLabel, sort_order: drawings.length })
      .select()
      .single();
    setCreating(false);
    if (data) router.push(`/jobs/${jobId}/drawings/${data.id}`);
  }

  async function deletePage(id: string) {
    if (!confirm("Delete this drawing page? This cannot be undone.")) return;
    await supabase.from("job_drawings").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Button onClick={addPage} disabled={creating} size="sm">
        <Plus className="h-4 w-4" /> {creating ? "Creating..." : "New Drawing Page"}
      </Button>

      {drawings.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Pencil className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No drawing pages yet. Add one to sketch measurements in the field.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {drawings.map((d) => (
          <div key={d.id} className="group relative">
            <Link href={`/jobs/${jobId}/drawings/${d.id}`}>
              <div className="aspect-[4/3] rounded-lg overflow-hidden bg-white border hover:border-slate-400 transition-colors flex items-center justify-center">
                {d.thumbnail ? (
                  <img src={d.thumbnail} alt={d.label} className="w-full h-full object-contain" />
                ) : (
                  <Pencil className="h-8 w-8 text-slate-300" />
                )}
              </div>
              <p className="text-xs font-medium mt-1 truncate">{d.label}</p>
            </Link>
            <button
              onClick={() => deletePage(d.id)}
              className="absolute top-1 right-1 p-1 rounded bg-white/90 border opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Delete page"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-600" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
