"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { customerName } from "@/lib/utils";

type JobOption = {
  id: string;
  title: string;
  customer: { first_name: string; last_name: string | null } | null;
};

export function NewEstimateForm({ jobs }: { jobs: JobOption[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [jobId, setJobId] = useState("");
  const [name, setName] = useState("Estimate");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (!jobId) {
      setError("Please choose a job.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("estimates")
      .insert({ job_id: jobId, name: name || "Estimate" })
      .select("id")
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create estimate.");
      setSubmitting(false);
      return;
    }

    router.push(`/estimates/${data.id}`);
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="space-y-1.5">
          <Label>Job *</Label>
          <Select value={jobId} onValueChange={setJobId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a job..." />
            </SelectTrigger>
            <SelectContent>
              {jobs.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.title}
                  {job.customer ? ` · ${customerName(job.customer)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {jobs.length === 0 && (
            <p className="text-xs text-muted-foreground">No jobs found — create a job first.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Estimate Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Estimate" />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleStart} disabled={submitting || !jobId}>
          {submitting ? "Creating..." : "Start Estimate"}
        </Button>
      </CardContent>
    </Card>
  );
}
