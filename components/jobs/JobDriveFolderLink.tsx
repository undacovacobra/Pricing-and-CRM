"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderSync, ExternalLink, RefreshCw, AlertTriangle, FolderPlus, CheckCircle2 } from "lucide-react";

// Shows that a job auto-imports from its Google Drive folder and lets you pull
// files in on demand. No setup needed — it uses the folder already attached to
// the job. A collapsed "different folder" option can point it elsewhere.
export function JobDriveFolderLink({
  jobId,
  folderUrl,
  hasOverride,
}: {
  jobId: string;
  folderUrl: string | null;
  hasOverride: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "sync" | "save" | "reset" | "create">(null);
  // What Drive actually says about the folder, so a deleted folder doesn't look
  // the same as an empty one.
  const [health, setHealth] = useState<
    { state: "loading" } | { state: "none" } | { state: "missing" } | { state: "no_connection" } | { state: "ok"; fileCount: number }
  >({ state: "loading" });

  async function checkHealth() {
    try {
      const res = await fetch(`/api/jobs/${jobId}/drive-folder`);
      const data = await res.json();
      setHealth(res.ok ? data : { state: "missing" });
    } catch {
      setHealth({ state: "missing" });
    }
  }
  useEffect(() => { checkHealth(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [jobId]);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [showChange, setShowChange] = useState(false);
  const [newUrl, setNewUrl] = useState("");

  async function post(url?: string, action: "sync" | "save" = "sync") {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/drive-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(url ? { url } : {}),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          text: data.imported
            ? `Pulled in ${data.imported} file${data.imported === 1 ? "" : "s"} from Google Drive.`
            : "Up to date — no new files in the Drive folder.",
          tone: "ok",
        });
        setShowChange(false);
        setNewUrl("");
        checkHealth();
        router.refresh();
      } else {
        setMessage({ text: data.detail || data.error || "Couldn't sync.", tone: "warn" });
      }
    } catch (e) {
      setMessage({ text: String(e), tone: "warn" });
    } finally {
      setBusy(null);
    }
  }

  async function createFolder() {
    setBusy("create");
    setMessage(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/drive-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: "Created a Drive folder for this job. Save files into it and they'll appear here.", tone: "ok" });
        checkHealth();
        router.refresh();
      } else {
        setMessage({ text: data.detail || data.error || "Couldn't create the folder.", tone: "warn" });
      }
    } catch (e) {
      setMessage({ text: String(e), tone: "warn" });
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setMessage(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/drive-folder`, { method: "DELETE" });
      if (res.ok) {
        setMessage({ text: "Reset to this job's own Drive folder.", tone: "ok" });
        router.refresh();
      } else {
        const data = await res.json();
        setMessage({ text: data.detail || "Couldn't reset.", tone: "warn" });
      }
    } catch (e) {
      setMessage({ text: String(e), tone: "warn" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <FolderSync className="h-4 w-4 text-slate-500" /> Google Drive folder
      </div>
      <p className="text-xs text-muted-foreground">
        Anything you save into this job&apos;s Google Drive folder is pulled into the attachments automatically
        each night. Use <strong>Sync now</strong> to pull it in immediately.
      </p>

      {/* Say plainly what Drive reports, rather than showing an empty list either way. */}
      {health.state === "missing" && (
        <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-2 text-xs text-orange-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            This job&apos;s Google Drive folder no longer exists — it was deleted or renamed in Drive, so the link
            above opens a 404 and nothing can sync. Create a new folder to fix it, or point the job at an existing one.
          </span>
        </div>
      )}
      {health.state === "none" && (
        <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
          <span>This job has no Google Drive folder yet.</span>
        </div>
      )}
      {health.state === "no_connection" && (
        <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-2 text-xs text-orange-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Google Drive isn&apos;t connected, so folders can&apos;t be read (Settings → Connect Google Drive).</span>
        </div>
      )}
      {health.state === "ok" && (
        <p className="flex items-center gap-1.5 text-xs text-slate-600">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
          {health.fileCount === 0
            ? "Folder is connected and currently empty."
            : `Folder is connected — ${health.fileCount} file${health.fileCount === 1 ? "" : "s"} in Drive.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(health.state === "missing" || health.state === "none") ? (
          <Button size="sm" className="h-8" disabled={busy !== null} onClick={createFolder}>
            <FolderPlus className="h-3.5 w-3.5" /> {busy === "create" ? "Creating…" : "Create a folder"}
          </Button>
        ) : (
          <Button size="sm" className="h-8" disabled={busy !== null} onClick={() => post(undefined, "sync")}>
            <RefreshCw className="h-3.5 w-3.5" /> {busy === "sync" ? "Syncing…" : "Sync now"}
          </Button>
        )}
        {folderUrl && health.state !== "missing" && (
          <a href={folderUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <ExternalLink className="h-3 w-3" /> Open the folder
          </a>
        )}
        <button
          type="button"
          onClick={() => setShowChange((s) => !s)}
          className="text-xs text-slate-500 hover:text-slate-800 hover:underline ml-auto"
        >
          {hasOverride ? "Change folder" : "Use a different folder"}
        </button>
      </div>

      {showChange && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
              className="h-8 text-sm flex-1 min-w-[200px]"
            />
            <Button size="sm" className="h-8" disabled={busy !== null || !newUrl.trim()} onClick={() => post(newUrl.trim(), "save")}>
              {busy === "save" ? "Saving…" : "Use this folder"}
            </Button>
          </div>
          {hasOverride && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500" disabled={busy !== null} onClick={reset}>
              Reset to the job&apos;s own folder
            </Button>
          )}
        </div>
      )}

      {message && (
        <p className={`text-xs ${message.tone === "ok" ? "text-green-700" : "text-orange-700"}`}>{message.text}</p>
      )}
    </div>
  );
}
