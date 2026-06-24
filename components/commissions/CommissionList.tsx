"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/utils";
import { triggerBackup } from "@/lib/backup/trigger";
import { Trash2 } from "lucide-react";
import type { DesignerCommission } from "@/lib/types/database";

interface CommissionWithJob extends DesignerCommission {
  job: { title: string; customer: { first_name: string; last_name: string } | null } | null;
}

function commissionTitle(c: CommissionWithJob) {
  return c.notes || c.job?.title || c.job_name_freeform || "No description";
}

export function CommissionList({ commissions, isOwner }: { commissions: CommissionWithJob[]; isOwner: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const pending = commissions.filter((c) => c.status === "pending");
  const paid = commissions.filter((c) => c.status === "paid");

  async function handleDelete(c: CommissionWithJob) {
    if (!confirm(`Delete "${commissionTitle(c)}"? This can't be undone.`)) return;
    await supabase.storage.from("commission-invoices").remove([c.invoice_storage_path]);
    await supabase.from("designer_commissions").delete().eq("id", c.id);
    triggerBackup({ commissions: true });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Pending */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-orange-600">Pending ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No pending commissions.</p>
          )}
          {pending.map((c) => (
            <CommissionRow key={c.id} commission={c} isOwner={isOwner} onDelete={() => handleDelete(c)} />
          ))}
        </CardContent>
      </Card>

      {/* Paid History */}
      {paid.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">Paid History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {paid.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg opacity-70">
                <div>
                  <p className="text-sm font-medium">{commissionTitle(c)}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.job?.customer ? `${c.job.customer.first_name} ${c.job.customer.last_name} · ` : ""}
                    Submitted {formatDate(c.submitted_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-700">
                      {formatCurrency(c.paid_amount ?? c.amount ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Paid {c.paid_at ? formatDate(c.paid_at) : ""}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => handleDelete(c)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CommissionRow({
  commission: c,
  isOwner,
  onDelete,
}: {
  commission: CommissionWithJob;
  isOwner: boolean;
  onDelete: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [paying, setPaying] = useState(false);
  const [paidAmount, setPaidAmount] = useState(c.amount?.toString() ?? "");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleMarkPaid() {
    setLoading(true);
    await supabase.from("designer_commissions").update({
      status:         "paid",
      paid_amount:    parseFloat(paidAmount) || c.amount,
      paid_at:        new Date(paidDate).toISOString(),
      payment_method: method || null,
    }).eq("id", c.id);
    triggerBackup({ commissions: true });
    setLoading(false);
    setPaying(false);
    router.refresh();
  }

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium">{commissionTitle(c)}</p>
          <p className="text-xs text-muted-foreground">
            {c.job?.customer ? `${c.job.customer.first_name} ${c.job.customer.last_name} · ` : ""}
            Submitted {formatDate(c.submitted_at)}
          </p>
          {c.amount && (
            <p className="text-sm font-semibold mt-1">{formatCurrency(c.amount)}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/commission-invoices/${c.invoice_storage_path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            View Invoice
          </a>
          {isOwner && (
            <Button size="sm" onClick={() => setPaying(!paying)}>
              Mark Paid
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {paying && isOwner && (
        <div className="bg-slate-50 rounded-lg p-3 space-y-3 border">
          <p className="text-sm font-medium">Record Payment</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Amount Paid ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Method</Label>
              <Input
                placeholder="Zelle, check..."
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleMarkPaid} disabled={loading}>
              {loading ? "Saving..." : "Confirm Payment"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPaying(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
