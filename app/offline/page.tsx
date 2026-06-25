"use client";
import { useEffect, useState, useCallback } from "react";
import { CloudOff, Pencil, ChevronLeft, FileText, Plus, RefreshCw, Wifi } from "lucide-react";
import { DrawingCanvas } from "@/components/drawings/DrawingCanvas";
import { flushPendingDrawings } from "@/lib/offline/sync";
import { primeOfflineCache } from "@/lib/offline/prime";
import {
  getAllJobs,
  getAllDrawings,
  getJobFiles,
  putDrawing,
  type OfflineDrawing,
  type OfflineJobFiles,
} from "@/lib/offline/db";
import type { JobDrawing, DrawingStroke } from "@/lib/types/database";

// A fully self-contained offline workspace. It never calls the server to
// render, so it can't throw the "client-side exception" that server-driven
// pages do when there's no connection. Everything comes from IndexedDB:
// the jobs/drawings/files cached while the app was last online.

interface JobRow {
  id: string;
  title: string;
  drawings: OfflineDrawing[];
}

function toJobDrawing(d: OfflineDrawing): JobDrawing {
  return {
    id: d.id,
    job_id: d.job_id,
    label: d.label,
    strokes: (d.strokes as DrawingStroke[]) ?? [],
    thumbnail: d.thumbnail,
    sort_order: d.sort_order ?? 0,
    created_by: null,
    created_at: d.updated_at,
    updated_at: d.updated_at,
  };
}

export default function OfflineWorkspace() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selected, setSelected] = useState<JobRow | null>(null);
  const [files, setFiles] = useState<OfflineJobFiles | null>(null);
  const [editing, setEditing] = useState<JobDrawing | null>(null);
  const [online, setOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [jobList, drawings] = await Promise.all([getAllJobs(), getAllDrawings()]);
    const byJob = new Map<string, OfflineDrawing[]>();
    for (const d of drawings) {
      const arr = byJob.get(d.job_id) ?? [];
      arr.push(d);
      byJob.set(d.job_id, arr);
    }
    const titles = new Map(jobList.map((j) => [j.id, j.title]));
    // Every job we know a title for, plus any job that only has cached drawings.
    const ids = new Set<string>();
    jobList.forEach((j) => ids.add(j.id));
    byJob.forEach((_v, k) => ids.add(k));
    const rows: JobRow[] = Array.from(ids)
      .map((id) => ({
        id,
        title: titles.get(id) ?? "Job",
        drawings: (byJob.get(id) ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
    setJobs(rows);
    setLoaded(true);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    // If we happen to be online here, pull everything down first, then list it.
    (async () => {
      if (navigator.onLine) await primeOfflineCache();
      await load();
    })();
    const on = () => {
      setOnline(true);
      primeOfflineCache().then(() => load());
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [load]);

  async function openJob(job: JobRow) {
    setSelected(job);
    setFiles(await getJobFiles(job.id));
  }

  async function newDrawing(job: JobRow) {
    const id = crypto.randomUUID();
    const d: OfflineDrawing = {
      id,
      job_id: job.id,
      label: `Page ${job.drawings.length + 1}`,
      strokes: [],
      thumbnail: null,
      sort_order: job.drawings.length,
      updated_at: new Date().toISOString(),
      pendingSync: true,
      pendingInsert: true,
    };
    await putDrawing(d);
    await load();
    setEditing(toJobDrawing(d));
  }

  async function sync() {
    setSyncing(true);
    await flushPendingDrawings();
    await primeOfflineCache(true);
    setSyncing(false);
    await load();
  }

  // ---- Drawing editor ----
  if (editing) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header online={online} />
        <div className="max-w-3xl mx-auto p-3">
          <button
            onClick={async () => {
              setEditing(null);
              await load();
              if (selected) await openJob(selected);
            }}
            className="inline-flex items-center gap-1 text-sm text-slate-600 mb-3"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <DrawingCanvas jobId={editing.job_id} drawing={editing} />
        </div>
      </div>
    );
  }

  // ---- Job detail (drawings + files) ----
  if (selected) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header online={online} />
        <div className="max-w-3xl mx-auto p-4 space-y-5">
          <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1 text-sm text-slate-600">
            <ChevronLeft className="h-4 w-4" /> All jobs
          </button>
          <h1 className="text-xl font-bold text-slate-900">{selected.title}</h1>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-700">Drawings</h2>
              <button onClick={() => newDrawing(selected)} className="inline-flex items-center gap-1 text-xs font-medium rounded-lg bg-slate-900 text-white px-2.5 py-1.5">
                <Plus className="h-3.5 w-3.5" /> New page
              </button>
            </div>
            {selected.drawings.length === 0 ? (
              <p className="text-sm text-slate-500">No cached drawings. Tap “New page” to start one — it saves on this device and syncs when you’re back online.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {selected.drawings.map((d) => (
                  <button key={d.id} onClick={() => setEditing(toJobDrawing(d))} className="text-left">
                    <div className="aspect-[4/3] rounded-lg overflow-hidden bg-white border flex items-center justify-center">
                      {d.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.thumbnail} alt={d.label} className="w-full h-full object-contain" />
                      ) : (
                        <Pencil className="h-8 w-8 text-slate-300" />
                      )}
                    </div>
                    <p className="text-xs font-medium mt-1 truncate flex items-center gap-1">
                      {d.label}
                      {d.pendingSync && <span className="text-amber-600">•</span>}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Files in this job</h2>
            {files?.files?.length ? (
              <ul className="space-y-1">
                {files.files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-xs text-slate-400 shrink-0">{f.kind}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No cached file list. Open this job once while online to make its files visible offline.</p>
            )}
          </section>
        </div>
      </div>
    );
  }

  // ---- Job list ----
  return (
    <div className="min-h-screen bg-slate-50">
      <Header online={online} />
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <p className="text-sm text-slate-500">
          {online
            ? "You’re back online — your full app is available. This is the lightweight offline workspace."
            : "You’re offline. You can open your cached jobs, draw, and save here. Everything syncs automatically when you reconnect."}
        </p>

        <button
          onClick={sync}
          disabled={syncing || !online}
          className="inline-flex items-center gap-2 text-sm font-medium rounded-lg border px-3 py-2 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync now"}
        </button>

        {online && (
          <a href="/" className="block text-sm text-blue-600 underline">
            ← Back to the full app
          </a>
        )}

        {!loaded ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing cached yet. While you have signal, open the jobs (and their Drawings) you’ll need, and they’ll be available here offline.
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => openJob(j)}
                className="w-full text-left rounded-lg border bg-white px-4 py-3 flex items-center justify-between hover:border-slate-400"
              >
                <span className="font-medium text-slate-900 truncate">{j.title}</span>
                <span className="text-xs text-slate-400 shrink-0 ml-2">
                  {j.drawings.length} drawing{j.drawings.length === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ online }: { online: boolean }) {
  return (
    <div className={`px-4 py-3 text-white flex items-center gap-2 ${online ? "bg-slate-900" : "bg-amber-500"}`}>
      {online ? <Wifi className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
      <span className="font-semibold text-sm">{online ? "Offline workspace" : "Offline mode"}</span>
    </div>
  );
}
