"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import type { Job } from "@/lib/types/database";

export function NewCommissionForm({ jobs }: { jobs: Job[] }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [jobMode, setJobMode] = useState<"existing" | "freeform">("existing");
  const [jobId, setJobId] = useState("");
  const [jobName, setJobName] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Please attach a file."); return; }
    if (jobMode === "existing" && !jobId) { setError("Select a job or switch to typing a job name."); return; }
    if (jobMode === "freeform" && !jobName.trim()) { setError("Enter a job name."); return; }
    if (!notes.trim()) { setError("Enter a note describing what this commission is for."); return; }
    setError(null);
    setUploading(true);

    const path = `${jobMode === "existing" ? jobId : "unlinked"}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("commission-invoices").upload(path, file);
    if (uploadErr) { setError(uploadErr.message); setUploading(false); return; }

    await supabase.from("designer_commissions").insert({
      job_id:                jobMode === "existing" ? jobId : null,
      job_name_freeform:     jobMode === "freeform" ? jobName.trim() : null,
      invoice_storage_path:  path,
      amount:                amount ? parseFloat(amount) : null,
      status:                "pending",
      submitted_at:          new Date().toISOString(),
      notes:                 notes.trim(),
    });

    if (jobMode === "existing" && jobId) {
      await supabase.from("job_notes").insert({
        job_id:  jobId,
        author:  "designer",
        content: "Internal invoice submitted",
      });
    }

    setUploading(false);
    setOpen(false);
    setJobId(""); setJobName(""); setAmount(""); setNotes("");
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Start New Commission Submission
      </Button>
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
      <p className="text-sm font-medium">New Commission Submission</p>

      <div className="space-y-1.5">
        <Label className="text-xs">What&apos;s this commission for? *</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Smith kitchen design fee"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Job</Label>
        <div className="flex items-center gap-2 mb-2">
          <Select value={jobMode} onValueChange={(v) => setJobMode(v as "existing" | "freeform")}>
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="existing">Pick existing job</SelectItem>
              <SelectItem value="freeform">Type job name</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {jobMode === "existing" ? (
          <Select value={jobId} onValueChange={setJobId}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select a job..." />
            </SelectTrigger>
            <SelectContent>
              {jobs.map((j) => (
                <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder="Job name" className="h-8 text-sm" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Invoice Amount ($) — optional</Label>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Invoice PDF / File</Label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="block w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-white file:text-xs file:font-medium hover:file:bg-slate-100"
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={uploading}>
          {uploading ? "Submitting..." : "Submit"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
