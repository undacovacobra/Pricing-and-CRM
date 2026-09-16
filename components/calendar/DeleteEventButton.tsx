"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { triggerBackup } from "@/lib/backup/trigger";

export function DeleteEventButton({
  eventId,
  eventTitle,
  recurrenceGroupId,
}: {
  eventId: string;
  eventTitle: string;
  // Set when this event is one date of a repeating series.
  recurrenceGroupId?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<null | "one" | "series">(null);
  const [error, setError] = useState<string | null>(null);
  const isSeries = Boolean(recurrenceGroupId);

  // "one" removes just this date; "series" removes every date in the series.
  async function handleDelete(scope: "one" | "series") {
    setDeleting(scope);
    setError(null);
    const query = supabase.from("calendar_events").delete();
    const { error: deleteErr } =
      scope === "series" && recurrenceGroupId
        ? await query.eq("recurrence_group_id", recurrenceGroupId)
        : await query.eq("id", eventId);
    if (deleteErr) { setError(deleteErr.message); setDeleting(null); return; }
    triggerBackup({ calendar: true });
    router.push("/calendar");
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
            <DialogTitle>{isSeries ? "Delete repeating event" : "Delete this event?"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">
            {isSeries ? (
              <>
                <span className="font-medium">{eventTitle}</span> repeats. Remove only this date, or every date in the
                series? This can&apos;t be undone.
              </>
            ) : (
              <>
                This permanently removes <span className="font-medium">{eventTitle}</span> from the calendar. This
                can&apos;t be undone.
              </>
            )}
          </p>
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={deleting !== null}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleDelete("one")} disabled={deleting !== null}>
              {deleting === "one" ? "Deleting…" : isSeries ? "Just this date" : "Delete Event"}
            </Button>
            {isSeries && (
              <Button size="sm" variant="destructive" onClick={() => handleDelete("series")} disabled={deleting !== null}>
                {deleting === "series" ? "Deleting…" : "All dates"}
              </Button>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
