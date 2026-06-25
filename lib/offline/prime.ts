// Proactively mirrors the data the offline workspace needs onto the device,
// so EVERY job (with its drawings and file list) is available offline — not
// just the ones the user happened to open. Runs whenever the app is online.

import { createClient } from "@/lib/supabase/client";
import { putJob, putDrawing, putJobFiles, getDrawing } from "@/lib/offline/db";

let priming = false;
let lastRun = 0;

export async function primeOfflineCache(force = false): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  if (priming) return false;
  // Avoid hammering: at most once a minute unless forced.
  if (!force && Date.now() - lastRun < 60_000) return false;
  priming = true;
  try {
    const supabase = createClient();

    const { data: jobs, error } = await supabase.from("jobs").select("id, title");
    if (error || !jobs) return false;
    for (const j of jobs) await putJob(j.id, j.title);

    // All drawings — but never overwrite an unsynced local edit.
    const { data: drawings } = await supabase.from("job_drawings").select("*");
    for (const d of drawings ?? []) {
      const local = await getDrawing(d.id);
      if (local?.pendingSync) continue;
      await putDrawing({
        id: d.id,
        job_id: d.job_id,
        label: d.label,
        strokes: d.strokes ?? [],
        thumbnail: d.thumbnail ?? null,
        sort_order: d.sort_order ?? 0,
        updated_at: d.updated_at ?? new Date().toISOString(),
        pendingSync: false,
      });
    }

    // A file list per job (names only — enough to answer "what's in this job").
    const [att, photos, contracts, docs] = await Promise.all([
      supabase.from("job_attachments").select("job_id, file_name"),
      supabase.from("job_photos").select("job_id, caption"),
      supabase.from("contract_documents").select("job_id, kind, file_name"),
      supabase.from("documents").select("job_id, document_type, document_number"),
    ]);
    const byJob = new Map<string, { kind: string; name: string }[]>();
    const add = (jobId: string | null, kind: string, name: string) => {
      if (!jobId) return;
      const arr = byJob.get(jobId) ?? [];
      arr.push({ kind, name });
      byJob.set(jobId, arr);
    };
    (att.data ?? []).forEach((r) => add(r.job_id, "Attachment", r.file_name));
    (drawings ?? []).forEach((r) => add(r.job_id, "Drawing", r.label || "Untitled"));
    (photos.data ?? []).forEach((r) => add(r.job_id, "Photo", r.caption || "(photo)"));
    (contracts.data ?? []).forEach((r) => add(r.job_id, r.kind === "change_order" ? "Change order" : "Contract", r.file_name || r.kind));
    (docs.data ?? []).forEach((r) => add(r.job_id, "Document", `${r.document_type} ${r.document_number ?? ""}`.trim()));

    const titles = new Map(jobs.map((j) => [j.id, j.title]));
    for (const j of jobs) {
      await putJobFiles({
        job_id: j.id,
        job_title: titles.get(j.id) ?? "Job",
        files: byJob.get(j.id) ?? [],
        cached_at: new Date().toISOString(),
      });
    }

    lastRun = Date.now();
    return true;
  } finally {
    priming = false;
  }
}
