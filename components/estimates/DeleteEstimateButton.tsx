"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

export function DeleteEstimateButton({
  estimateId,
  estimateName,
  jobId,
}: {
  estimateId: string;
  estimateName: string;
  jobId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    // estimate_line_items cascade-delete with the estimate.
    const { error: deleteErr } = await supabase.from("estimates").delete().eq("id", estimateId);
    if (deleteErr) {
      setError(deleteErr.message);
      setDeleting(false);
      return;
    }
    router.push(`/jobs/${jobId}`);
    router.refresh();
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
            <DialogTitle>Delete this estimate?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">
            This permanently deletes <span className="font-medium">{estimateName}</span> and all of its line
            items. This can&apos;t be undone.
          </p>
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={deleting}>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete Estimate"}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
