"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera } from "lucide-react";
import type { JobPhoto } from "@/lib/types/database";

export function PhotoGallery({ jobId, photos }: { jobId: string; photos: JobPhoto[] }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState<string>("during");
  const [filter, setFilter] = useState<string>("all");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);

    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `${jobId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("job-photos").upload(path, file);
      if (!uploadError) {
        await supabase.from("job_photos").insert({
          job_id:       jobId,
          storage_path: path,
          phase,
          uploaded_by:  "owner",
        });
      }
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  const filtered = filter === "all" ? photos : photos.filter((p) => p.phase === filter);
  const supabaseUrl = SUPABASE_URL;

  return (
    <div className="space-y-4">
      {/* Upload Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={phase} onValueChange={setPhase}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="before">Before</SelectItem>
            <SelectItem value="during">During</SelectItem>
            <SelectItem value="after">After</SelectItem>
          </SelectContent>
        </Select>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handleUpload}
          className="hidden"
          id="photo-upload"
        />
        <label htmlFor="photo-upload">
          <Button asChild variant="outline" size="sm" disabled={uploading}>
            <span>
              <Camera className="h-4 w-4" />
              {uploading ? "Uploading..." : "Take / Upload Photo"}
            </span>
          </Button>
        </label>
      </div>

      {/* Filter */}
      {photos.length > 0 && (
        <div className="flex gap-2">
          {["all", "before", "during", "after"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors capitalize ${
                filter === f ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 hover:bg-slate-100"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Camera className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No photos yet. Upload site photos to keep a visual record.</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filtered.map((photo) => (
          <div key={photo.id} className="aspect-square rounded-lg overflow-hidden bg-slate-200 relative group">
            <img
              src={`${supabaseUrl}/storage/v1/object/public/job-photos/${photo.storage_path}`}
              alt={photo.caption ?? "Job photo"}
              className="w-full h-full object-cover"
            />
            {photo.phase && (
              <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded capitalize">
                {photo.phase}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
