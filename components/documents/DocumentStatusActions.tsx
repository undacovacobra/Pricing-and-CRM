"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { DocumentStatus } from "@/lib/types/database";

const nextStatus: Partial<Record<DocumentStatus, { status: DocumentStatus; label: string }>> = {
  draft:  { status: "sent",   label: "Mark as Sent" },
  sent:   { status: "signed", label: "Mark as Signed" },
  signed: { status: "paid",   label: "Mark as Paid" },
};

export function DocumentStatusActions({
  documentId,
  currentStatus,
  jobId,
}: {
  documentId: string;
  currentStatus: DocumentStatus;
  jobId: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const next = nextStatus[currentStatus];

  async function advanceStatus() {
    if (!next) return;
    const updateData: Record<string, unknown> = { status: next.status };
    if (next.status === "sent")   updateData.sent_at   = new Date().toISOString();
    if (next.status === "signed") updateData.signed_at = new Date().toISOString();
    if (next.status === "paid")   updateData.paid_at   = new Date().toISOString();

    await supabase.from("documents").update(updateData).eq("id", documentId);
    router.refresh();
  }

  async function voidDocument() {
    if (!confirm("Void this document? This cannot be undone.")) return;
    await supabase.from("documents").update({ status: "void" }).eq("id", documentId);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 shrink-0 flex-wrap">
      {next && (
        <Button size="sm" onClick={advanceStatus}>
          {next.label}
        </Button>
      )}
      {currentStatus !== "void" && currentStatus !== "paid" && (
        <Button size="sm" variant="outline" onClick={voidDocument}>
          Void
        </Button>
      )}
    </div>
  );
}
