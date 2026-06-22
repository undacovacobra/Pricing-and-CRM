"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

export function DeleteCustomerButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    // Customers with jobs can't be deleted (jobs.customer_id is RESTRICT).
    const { count } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId);

    if (count && count > 0) {
      setError(
        `This customer has ${count} job${count === 1 ? "" : "s"} attached. Delete the job${count === 1 ? "" : "s"} first, then delete the customer.`
      );
      setDeleting(false);
      return;
    }

    // Communications cascade-delete; any sub-customers are detached (SET NULL).
    const { error: deleteErr } = await supabase.from("customers").delete().eq("id", customerId);
    if (deleteErr) {
      setError(deleteErr.message);
      setDeleting(false);
      return;
    }
    router.push("/customers");
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
            <DialogTitle>Delete this customer?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">
            This permanently deletes <span className="font-medium">{customerName}</span> and their communication
            history. This can&apos;t be undone. Customers with jobs attached must have those jobs deleted first.
          </p>
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={deleting}>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete Customer"}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
