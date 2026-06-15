import { Badge } from "@/components/ui/badge";
import type { JobStage } from "@/lib/types/database";

const stageConfig: Record<JobStage, { label: string; variant: "default" | "secondary" | "outline" | "success" | "warning" | "info" | "purple" | "destructive" }> = {
  lead:             { label: "Lead",             variant: "outline" },
  proposal_sent:    { label: "Proposal Sent",    variant: "info" },
  contract_signed:  { label: "Contract Signed",  variant: "purple" },
  in_progress:      { label: "In Progress",      variant: "warning" },
  punch_list:       { label: "Punch List",       variant: "warning" },
  complete:         { label: "Complete",         variant: "success" },
  on_hold:          { label: "On Hold",          variant: "secondary" },
  cancelled:        { label: "Cancelled",        variant: "destructive" },
};

export function JobStageBadge({ stage }: { stage: JobStage }) {
  const config = stageConfig[stage] ?? { label: stage, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export const JOB_STAGES: { value: JobStage; label: string }[] = [
  { value: "lead",            label: "Lead" },
  { value: "proposal_sent",   label: "Proposal Sent" },
  { value: "contract_signed", label: "Contract Signed" },
  { value: "in_progress",     label: "In Progress" },
  { value: "punch_list",      label: "Punch List" },
  { value: "complete",        label: "Complete" },
  { value: "on_hold",         label: "On Hold" },
  { value: "cancelled",       label: "Cancelled" },
];
