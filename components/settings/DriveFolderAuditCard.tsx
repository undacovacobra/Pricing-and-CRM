"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderCheck, FolderPlus, AlertTriangle, CheckCircle2 } from "lucide-react";

interface NeedsFolder {
  id: string;
  title: string;
  reason: "missing" | "none";
}

// Owner tool: check every job's Google Drive folder in one pass and create the
// ones that are missing — so broken folders don't have to be found job by job.
export function DriveFolderAuditCard() {
  const [busy, setBusy] = useState<null | "check" | "fix">(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [needs, setNeeds] = useState<NeedsFolder[] | null>(null);
  const [healthy, setHealthy] = useState<number | null>(null);

  async function run(fix: boolean) {
    setBusy(fix ? "fix" : "check");
    setMessage(null);
    try {
      const res = await fetch("/api/jobs/drive-folders/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fix }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.detail || data.error || "Check failed.", tone: "warn" });
        return;
      }
      setHealthy(data.healthy ?? null);
      if (fix) {
        setNeeds([]);
        const madeCount = data.created?.length ?? 0;
        const failedCount = data.failed?.length ?? 0;
        setMessage({
          text:
            `Created ${madeCount} folder${madeCount === 1 ? "" : "s"}.` +
            (failedCount ? ` ${failedCount} couldn't be created — check Drive permissions.` : ""),
          tone: failedCount ? "warn" : "ok",
        });
      } else {
        setNeeds(data.needsFolder ?? []);
        const n = data.needsFolder?.length ?? 0;
        setMessage({
          text: n
            ? `${data.healthy} job folder${data.healthy === 1 ? "" : "s"} fine. ${n} need${n === 1 ? "s" : ""} a folder.`
            : `All ${data.healthy} job folders are working.`,
          tone: n ? "warn" : "ok",
        });
      }
    } catch (e) {
      setMessage({ text: String(e), tone: "warn" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FolderCheck className="h-4 w-4" /> Job Drive folders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Checks every job&apos;s Google Drive folder and reports any that were deleted in Drive (the link gives a 404)
          or were never created. Then creates the missing ones in a single pass, next to your existing job folders.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run(false)}>
            <FolderCheck className="h-4 w-4" /> {busy === "check" ? "Checking…" : "Check all job folders"}
          </Button>
          {needs && needs.length > 0 && (
            <Button size="sm" disabled={busy !== null} onClick={() => run(true)}>
              <FolderPlus className="h-4 w-4" /> {busy === "fix" ? "Creating…" : `Create the ${needs.length} missing`}
            </Button>
          )}
        </div>
        {busy && <p className="text-xs text-muted-foreground">This checks each job against Drive — give it a moment.</p>}

        {message && (
          <div
            className={`flex items-start gap-2 text-sm rounded-md px-3 py-2 ${
              message.tone === "ok"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-orange-50 text-orange-700 border border-orange-200"
            }`}
          >
            {message.tone === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {needs && needs.length > 0 && (
          <div className="space-y-1">
            {needs.map((n) => (
              <div key={n.id} className="text-xs border rounded-md px-3 py-2 flex items-center justify-between gap-2">
                <span className="truncate font-medium">{n.title}</span>
                <span className="text-muted-foreground shrink-0">
                  {n.reason === "missing" ? "folder deleted in Drive" : "no folder yet"}
                </span>
              </div>
            ))}
          </div>
        )}
        {healthy !== null && needs?.length === 0 && (
          <p className="text-xs text-muted-foreground">Nothing left to fix.</p>
        )}
      </CardContent>
    </Card>
  );
}
