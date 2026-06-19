"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

async function removeFolderRecursive(supabase: SupabaseClient, bucket: string, prefix: string) {
  const { data } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (!data?.length) return;
  for (const entry of data) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      await removeFolderRecursive(supabase, bucket, path);
    } else {
      await supabase.storage.from(bucket).remove([path]);
    }
  }
}

export function DeleteJobButton({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await Promise.all([
        removeFolderRecursive(supabase, "job-attachments", jobId),
        removeFolderRecursive(supabase, "job-attachments", `notes/${jobId}`),
        removeFolderRecursive(supabase, "job-photos", jobId),
        removeFolderRecursive(supabase, "commission-invoices", jobId),
      ]);

      // Delete dependent rows first — documents and payments use ON DELETE
      // RESTRICT, so the job row can't be removed while they still exist.
      await supabase.from("documents").delete().eq("job_id", jobId);
      await supabase.from("payments").delete().eq("job_id", jobId);
      await supabase.from("job_attachments").delete().eq("job_id", jobId);
      await supabase.from("contract_documents").delete().eq("job_id", jobId);
      await supabase.from("material_orders").delete().eq("job_id", jobId);
      await supabase.from("job_notes").delete().eq("job_id", jobId);
      await supabase.from("job_photos").delete().eq("job_id", jobId);

      const { error: deleteErr } = await supabase.from("jobs").delete().eq("id", jobId);
      if (deleteErr) { setError(deleteErr.message); setDeleting(false); return; }

      router.push("/jobs");
      router.refresh();
    } catch (e) {
      setError(`Could not delete job: ${String(e)}`);
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        <span className="hidden sm:inline">Delete</span>
      </Button>
      {open && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this job?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">
            This permanently deletes <span className="font-medium">{jobTitle}</span> and everything attached to
            it — documents, payments, attachments, photos, notes, contracts, and change orders. This can&apos;t be
            undone.
          </p>
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={deleting}>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete Job"}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
