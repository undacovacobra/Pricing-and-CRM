"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";

export function AddPaymentForm({
  documentId,
  jobId,
  maxAmount,
}: {
  documentId: string;
  jobId: string;
  maxAmount: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [amount, setAmount] = useState(maxAmount > 0 ? maxAmount.toFixed(2) : "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return;
    setSaving(true);

    await supabase.from("payments").insert({
      document_id:  documentId,
      job_id:       jobId,
      amount:       parseFloat(amount),
      payment_date: date,
      method:       method || null,
      reference:    reference || null,
    });

    setSaving(false);
    setAmount("");
    setReference("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {maxAmount > 0 && (
        <p className="text-xs text-muted-foreground">Balance due: {formatCurrency(maxAmount)}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Amount ($)</Label>
          <Input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-8 text-sm"
            required
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Method</Label>
          <Input
            placeholder="Check, Zelle, Cash..."
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Reference #</Label>
          <Input
            placeholder="Check #, transaction ID..."
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? "Recording..." : "Record Payment"}
      </Button>
    </form>
  );
}
