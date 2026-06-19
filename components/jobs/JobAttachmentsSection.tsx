"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { Paperclip, Trash2, Download } from "lucide-react";
import type { JobAttachment } from "@/lib/types/database";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

function isImageFile(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.includes(ext);
}
function isPdfFile(fileName: string) {
  return /\.pdf$/i.test(fileName);
}
function isWordFile(fileName: string) {
  return /\.docx?$/i.test(fileName);
}

export function JobAttachmentsSection({ jobId, attachments, googleReady }: { jobId: string; attachments: JobAttachment[]; googleReady: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<JobAttachment | null>(null);
  const [openingDoc, setOpeningDoc] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  async function handleEdit(attachment: JobAttachment) {
    setEditError(null);
    setOpeningDoc(true);
    try {
      const res = await fetch("/api/google/edit-attachment", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, storagePath: attachment.storage_path, fileName: attachment.file_name }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setEditError(`Could not open in Google Docs: ${data.error ?? "unknown error"}${data.detail ? ` — ${data.detail}` : ""}`);
        setOpeningDoc(false);
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
      setOpeningDoc(false);
    } catch (e) {
      setEditError(`Could not open in Google Docs: ${String(e)}`);
      setOpeningDoc(false);
    }
  }

  return (
    <div className="space-y-3">
      {attachments.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">No attachments yet.</p>
      )}
      {attachments.map((att) => {
        const url = `${SUPABASE_URL}/storage/v1/object/public/job-attachments/${att.storage_path}`;
        const isImage = isImageFile(att.file_name);
        return (
          <div key={att.id} className="flex items-center justify-between p-2 border rounded-lg hover:bg-slate-50">
            <button
              type="button"
              onClick={() => { setEditError(null); setPreview(att); }}
              className="flex items-center gap-2 min-w-0 text-left flex-1"
            >
              {isImage ? (
                <div className="h-9 w-9 rounded overflow-hidden bg-slate-200 shrink-0">
                  <img src={url} alt={att.file_name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm truncate hover:underline">{att.file_name}</p>
                <p className="text-xs text-muted-foreground">{formatDate(att.created_at)}</p>
              </div>
            </button>
            <div className="flex gap-1 shrink-0 ml-2">
              <a href={url} target="_blank" rel="noopener noreferrer" download>
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

      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        {preview && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{preview.file_name}</DialogTitle>
            </DialogHeader>
            <div className="border rounded-lg overflow-hidden bg-slate-50">
              {isImageFile(preview.file_name) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${SUPABASE_URL}/storage/v1/object/public/job-attachments/${preview.storage_path}`}
                  alt={preview.file_name}
                  className="w-full max-h-[70vh] object-contain"
                />
              ) : isPdfFile(preview.file_name) ? (
                <iframe
                  src={`${SUPABASE_URL}/storage/v1/object/public/job-attachments/${preview.storage_path}`}
                  className="w-full h-[70vh]"
                  title={preview.file_name}
                />
              ) : (
                <iframe
                  src={`https://docs.google.com/gview?url=${encodeURIComponent(`${SUPABASE_URL}/storage/v1/object/public/job-attachments/${preview.storage_path}`)}&embedded=true`}
                  className="w-full h-[70vh]"
                  title={preview.file_name}
                />
              )}
            </div>
            {editError && <p className="text-xs text-destructive mt-2">{editError}</p>}
            <div className="flex justify-end gap-2 mt-3">
              {isWordFile(preview.file_name) && googleReady && (
                <Button size="sm" onClick={() => handleEdit(preview)} disabled={openingDoc}>
                  {openingDoc ? "Opening…" : "Edit in Google Docs"}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setPreview(null)}>Close</Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
