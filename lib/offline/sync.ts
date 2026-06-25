// Flushes offline drawing edits to Supabase. Safe to call repeatedly; it only
// touches records flagged pendingSync and clears the flag on success.

import { createClient } from "@/lib/supabase/client";
import { getPendingDrawings, markDrawingSynced } from "@/lib/offline/db";

let syncing = false;

export async function flushPendingDrawings(): Promise<{ synced: number; failed: number }> {
  if (syncing || typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    const pending = await getPendingDrawings();
    if (!pending.length) return { synced: 0, failed: 0 };
    const supabase = createClient();
    for (const d of pending) {
      const row = {
        id: d.id,
        job_id: d.job_id,
        label: d.label,
        strokes: d.strokes,
        thumbnail: d.thumbnail,
        sort_order: d.sort_order,
      };
      // upsert handles both offline-created (insert) and offline-edited (update).
      const { error } = await supabase.from("job_drawings").upsert(row, { onConflict: "id" });
      if (error) {
        failed++;
      } else {
        await markDrawingSynced(d.id);
        synced++;
      }
    }
    return { synced, failed };
  } finally {
    syncing = false;
  }
}
