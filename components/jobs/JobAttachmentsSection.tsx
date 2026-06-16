"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { Paperclip, Trash2, Download } from "lucide-react";
import type { JobAttachment } from "@/lib/types/database";

export function JobAttachmentsSection({ jobId, attachments }: { jobId: string; attachments: JobAttachment[] }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const files = fileRef.current?.files;
    if (!files?.length) return;
    setError(null);
    setUploading(true);

    for (const file of Array.from(files)) {
      const path = `${jobId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("job-attachments").upload(path, file);
      if (uploadErr) { setError(uploadErr.message); setUploading(false); return; }

      await supabase.from("job_attachments").insert({
        job_id:       jobId,
        storage_path: path,
        file_name:    file.name,
        file_size:    file.size,
      });
    }

    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
    router.refresh();
  }

  async function handleDelete(attachment: JobAttachment) {
    if (!confirm(`Remove "${attachment.file_name}"?`)) return;
    await supabase.storage.from("job-attachments").remove([attachment.storage_path]);
    await supabase.from("job_attachments").delete().eq("id", attachment.id);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {attachments.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">No attachments yet.</p>
      )}
      {attachments.map((att) => {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/job-attachments/${att.storage_path}`;
        return (
          <div key={att.id} className="flex items-center justify-between p-2 border rounded-lg hover:bg-slate-50">
            <div className="flex items-center gap-2 min-w-0">
              <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm truncate">{att.file_name}</p>
                <p className="text-xs text-muted-foreground">{formatDate(att.created_at)}</p>
              </div>
            </div>
            <div className="flex gap-1 shrink-0 ml-2">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="h-7 px-2"><Download className="h-3 w-3" /></Button>
              </a>
              <Button size="sm" variant="outline" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(att)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex gap-2 items-center">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
          className="block flex-1 text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-100 file:text-xs file:font-medium hover:file:bg-slate-200"
        />
        <Button size="sm" onClick={handleUpload} disabled={uploading}>
          {uploading ? "Uploading..." : "Upload"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
