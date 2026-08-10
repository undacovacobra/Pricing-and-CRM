"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderSearch } from "lucide-react";

interface MatchResult {
  job: string;
  lastName: string;
  folders: string[];
  imported: number;
}

// Owner tool: scan Google Drive for folders matching each job's customer last
// name and import their files — for jobs whose folders were made by hand in Drive.
export function DriveMatchCard() {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [results, setResults] = useState<MatchResult[] | null>(null);

  async function run() {
    setRunning(true);
    setMessage(null);
    setResults(null);
    try {
      const res = await fetch("/api/backup/match-folders", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setResults(data.jobs ?? []);
        setMessage({
          text: data.imported
            ? `Imported ${data.imported} file${data.imported === 1 ? "" : "s"} across ${data.jobs.length} job${data.jobs.length === 1 ? "" : "s"}.`
            : "Scan complete — no new matching files found.",
          tone: "ok",
        });
      } else {
        setMessage({ text: data.detail || data.error || "Scan failed.", tone: "warn" });
      }
    } catch (e) {
      setMessage({ text: String(e), tone: "warn" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FolderSearch className="h-4 w-4" /> Match Drive folders by last name
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Scans your whole Google Drive for folders whose name contains a job&apos;s customer last name,
          and imports their files into that job. Use this for jobs whose folders were set up by hand in Drive
          and never linked to the app. Folders the app already created are skipped, and nothing is duplicated.
        </p>

        <Button size="sm" disabled={running} onClick={run}>
          <FolderSearch className="h-4 w-4" /> {running ? "Scanning Drive…" : "Scan & import by last name"}
        </Button>
        {running && <p className="text-xs text-muted-foreground">This can take a minute across all jobs — hang tight.</p>}

        {message && (
          <div className={`text-sm rounded-md px-3 py-2 ${message.tone === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-orange-50 text-orange-700 border border-orange-200"}`}>
            {message.text}
          </div>
        )}

        {results && results.length > 0 && (
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <div key={i} className="text-xs border rounded-md px-3 py-2">
                <span className="font-medium">{r.job}</span> — imported {r.imported} file{r.imported === 1 ? "" : "s"}
                <span className="text-muted-foreground"> from {r.folders.join(", ")}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
