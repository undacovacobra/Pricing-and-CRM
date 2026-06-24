"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloudUpload, CheckCircle2, AlertTriangle } from "lucide-react";

interface LastRun {
  kind: string;
  status: string;
  detail: string | null;
  created_at: string;
}

export function BackupCard({
  serviceConfigured,
  driveConnected,
  lastRun,
}: {
  serviceConfigured: boolean;
  driveConnected: boolean;
  lastRun: LastRun | null;
}) {
  const [running, setRunning] = useState(false);
  const [fixingSharing, setFixingSharing] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  const ready = serviceConfigured && driveConnected;

  async function runBackup() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/backup/run", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          text: `Backup complete — ${data.jobs} jobs, ${data.files} new files, ${data.contacts} contacts copied to Google Drive.`,
          tone: "ok",
        });
      } else {
        setMessage({ text: data.detail || data.error || "Backup failed.", tone: "warn" });
      }
    } catch (e) {
      setMessage({ text: String(e), tone: "warn" });
    } finally {
      setRunning(false);
    }
  }

  async function fixSharing() {
    setFixingSharing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/google/fix-sharing", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          text: `Sharing fixed on ${data.shared} of ${data.total} Drive folders/files — nobody should hit "request access" anymore.`,
          tone: "ok",
        });
      } else {
        setMessage({ text: data.detail || data.error || "Couldn't fix sharing.", tone: "warn" });
      }
    } catch (e) {
      setMessage({ text: String(e), tone: "warn" });
    } finally {
      setFixingSharing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CloudUpload className="h-4 w-4" /> Backups
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Mirrors every job (details, notes, and all files) and a contacts spreadsheet into a
          <span className="font-medium"> Coastal Edge CRM Backup</span> folder in Google Drive, organized
          into Travis / Carol / Contacts. Runs automatically as you work and again every night.
        </p>

        {!serviceConfigured && (
          <div className="text-sm rounded-md px-3 py-2 bg-orange-50 text-orange-700 border border-orange-200">
            Backups aren&apos;t turned on yet. Add the <code>SUPABASE_SERVICE_ROLE_KEY</code> (and a
            <code> CRON_SECRET</code> for nightly runs) to the deployment&apos;s environment variables.
          </div>
        )}
        {serviceConfigured && !driveConnected && (
          <div className="text-sm rounded-md px-3 py-2 bg-orange-50 text-orange-700 border border-orange-200">
            Connect Google Drive (above) as the backup owner so there&apos;s somewhere to back up to.
          </div>
        )}

        {lastRun && (
          <div className="text-sm flex items-start gap-2">
            {lastRun.status === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
            )}
            <span className="text-slate-600">
              Last {lastRun.kind} backup {lastRun.status === "success" ? "succeeded" : "failed"} on{" "}
              {new Date(lastRun.created_at).toLocaleString()}.
              {lastRun.detail ? ` ${lastRun.detail}` : ""}
            </span>
          </div>
        )}

        {message && (
          <div
            className={`text-sm rounded-md px-3 py-2 ${
              message.tone === "ok"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-orange-50 text-orange-700 border border-orange-200"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={runBackup} disabled={!ready || running}>
            <CloudUpload className="h-4 w-4" />
            {running ? "Backing up…" : "Back up everything now"}
          </Button>
          <Button size="sm" variant="outline" onClick={fixSharing} disabled={!ready || fixingSharing}>
            {fixingSharing ? "Fixing sharing…" : "Fix sharing on existing files"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          If a Drive folder or file ever says &quot;you need to request access,&quot; click Fix Sharing — it
          opens every folder/file the app made to anyone with the link.
        </p>
      </CardContent>
    </Card>
  );
}
