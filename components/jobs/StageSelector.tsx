"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { JOB_STAGES } from "@/components/jobs/JobStageBadge";
import type { JobStage } from "@/lib/types/database";

export function StageSelector({ jobId, currentStage }: { jobId: string; currentStage: JobStage }) {
  const router = useRouter();
  const supabase = createClient();

  async function handleChange(newStage: string) {
    await supabase.from("jobs").update({ stage: newStage as JobStage }).eq("id", jobId);
    router.refresh();
  }

  return (
    <Select value={currentStage} onValueChange={handleChange}>
      <SelectTrigger className="w-44 h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {JOB_STAGES.map((s) => (
          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
