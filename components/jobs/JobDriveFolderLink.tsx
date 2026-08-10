"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderSync, ExternalLink, RefreshCw } from "lucide-react";

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
  const [busy, setBusy] = useState<null | "sync" | "save" | "reset">(null);
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

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8" disabled={busy !== null} onClick={() => post(undefined, "sync")}>
          <RefreshCw className="h-3.5 w-3.5" /> {busy === "sync" ? "Syncing…" : "Sync now"}
        </Button>
        {folderUrl && (
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
