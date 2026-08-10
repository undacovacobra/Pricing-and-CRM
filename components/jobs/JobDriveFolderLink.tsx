"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderSync, ExternalLink, RefreshCw, X } from "lucide-react";

// Lets the owner/designer point a job at one of their own Google Drive folders.
// Files dropped into that folder get pulled into the job's attachments — nightly
// and on demand — so you can save straight into Drive without opening the app.
export function JobDriveFolderLink({
  jobId,
  initialUrl,
  initialLinked,
}: {
  jobId: string;
  initialUrl: string | null;
  initialLinked: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [linked, setLinked] = useState(initialLinked);
  const [busy, setBusy] = useState<null | "link" | "sync" | "unlink">(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  async function link(action: "link" | "sync") {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/drive-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok) {
        setLinked(true);
        setMessage({
          text: data.imported
            ? `Linked — imported ${data.imported} file${data.imported === 1 ? "" : "s"}.`
            : "Linked — no new files to import yet.",
          tone: "ok",
        });
        router.refresh();
      } else {
        setMessage({ text: data.detail || data.error || "Couldn't link that folder.", tone: "warn" });
      }
    } catch (e) {
      setMessage({ text: String(e), tone: "warn" });
    } finally {
      setBusy(null);
    }
  }

  async function unlink() {
    setBusy("unlink");
    setMessage(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/drive-folder`, { method: "DELETE" });
      if (res.ok) {
        setLinked(false);
        setUrl("");
        setMessage({ text: "Unlinked. This job no longer imports from that folder.", tone: "ok" });
        router.refresh();
      } else {
        const data = await res.json();
        setMessage({ text: data.detail || "Couldn't unlink.", tone: "warn" });
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
        <FolderSync className="h-4 w-4 text-slate-500" /> Auto-import from a Google Drive folder
      </div>
      <p className="text-xs text-muted-foreground">
        Paste the link to this job&apos;s folder in your Google Drive. Anything you save there is pulled into
        the attachments automatically each night — plus instantly with &quot;Sync now.&quot;
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/…"
          className="h-8 text-sm flex-1 min-w-[200px]"
        />
        {!linked ? (
          <Button size="sm" className="h-8" disabled={busy !== null || !url.trim()} onClick={() => link("link")}>
            {busy === "link" ? "Linking…" : "Link folder"}
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" className="h-8" disabled={busy !== null} onClick={() => link("sync")}>
              <RefreshCw className="h-3.5 w-3.5" /> {busy === "sync" ? "Syncing…" : "Sync now"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-destructive" disabled={busy !== null} onClick={unlink}>
              <X className="h-3.5 w-3.5" /> Unlink
            </Button>
          </>
        )}
      </div>

      {linked && url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
          <ExternalLink className="h-3 w-3" /> Open the linked folder
        </a>
      )}

      {message && (
        <p className={`text-xs ${message.tone === "ok" ? "text-green-700" : "text-orange-700"}`}>{message.text}</p>
      )}
    </div>
  );
}
