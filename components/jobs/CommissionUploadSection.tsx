"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import type { DesignerCommission } from "@/lib/types/database";

export function CommissionUploadSection({ jobId, commissions }: { jobId: string; commissions: DesignerCommission[] }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split("T")[0]);
  const [paidMethod, setPaidMethod] = useState("");

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Please select a file."); return; }
    setError(null);
    setUploading(true);

    const path = `${jobId}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("commission-invoices").upload(path, file);
    if (uploadErr) { setError(uploadErr.message); setUploading(false); return; }

    await supabase.from("designer_commissions").insert({
      job_id:               jobId,
      invoice_storage_path: path,
      amount:               amount ? parseFloat(amount) : null,
      status:               "pending",
    });

    if (fileRef.current) fileRef.current.value = "";
    setAmount("");
    setUploading(false);
    router.refresh();
  }

  async function handleMarkPaid(c: DesignerCommission) {
    await supabase.from("designer_commissions").update({
      status:         "paid",
      paid_amount:    parseFloat(paidAmount) || c.amount,
      paid_at:        new Date(paidDate).toISOString(),
      payment_method: paidMethod || null,
    }).eq("id", c.id);
    setMarkingPaidId(null);
    setPaidAmount(""); setPaidMethod("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {commissions.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">No commission invoices submitted yet.</p>
      )}

      {commissions.map((c) => {
        const url = `${SUPABASE_URL}/storage/v1/object/public/commission-invoices/${c.invoice_storage_path}`;
        const isPaid = c.status === "paid";
        return (
          <div key={c.id} className={`border rounded-lg p-3 space-y-2 ${isPaid ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isPaid ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                    {isPaid ? "Paid" : "Pending"}
                  </span>
                  {c.amount && <span className="text-sm font-semibold">{formatCurrency(c.amount)}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Submitted {formatDate(c.submitted_at)}</p>
                {isPaid && c.paid_at && (
                  <p className="text-xs text-green-700">Paid {formatDate(c.paid_at)} — {formatCurrency(c.paid_amount ?? c.amount ?? 0)}{c.payment_method ? ` via ${c.payment_method}` : ""}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                    <ExternalLink className="h-3 w-3" /> Invoice
                  </Button>
                </a>
                {!isPaid && markingPaidId !== c.id && (
                  <Button size="sm" className="h-7 text-xs" onClick={() => { setMarkingPaidId(c.id); setPaidAmount(c.amount?.toString() ?? ""); }}>
                    Mark Paid
                  </Button>
                )}
              </div>
            </div>

            {markingPaidId === c.id && (
              <div className="bg-slate-50 rounded p-2 space-y-2 border">
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Amount Paid ($)</Label>
                    <Input type="number" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="h-7 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="h-7 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Method</Label>
                    <Input placeholder="Zelle, check..." value={paidMethod} onChange={(e) => setPaidMethod(e.target.value)} className="h-7 text-xs" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={() => handleMarkPaid(c)}>Confirm</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMarkingPaidId(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Upload new commission invoice */}
      <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Submit Commission Invoice</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Invoice Amount ($) — optional</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
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
        <Button size="sm" onClick={handleUpload} disabled={uploading}>
          {uploading ? "Uploading..." : "Submit Invoice"}
        </Button>
      </div>
    </div>
  );
}
