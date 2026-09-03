"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatCurrency, formatDate, todayInputValue } from "@/lib/utils";
import { triggerBackup } from "@/lib/backup/trigger";
import { Trash2, Download, Pencil } from "lucide-react";
import type { DesignerCommission, Job } from "@/lib/types/database";

function invoiceUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/commission-invoices/${path}`;
}

interface CommissionWithJob extends DesignerCommission {
  job: { title: string; customer: { first_name: string; last_name: string } | null } | null;
}

function commissionTitle(c: CommissionWithJob) {
  return c.notes || c.job?.title || c.job_name_freeform || "No description";
}

export function CommissionList({
  commissions,
  isOwner,
  jobs,
  readOnly = false,
}: {
  commissions: CommissionWithJob[];
  isOwner: boolean;
  jobs: Job[];
  readOnly?: boolean;
}) {
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
            <CommissionRow key={c.id} commission={c} isOwner={isOwner} jobs={jobs} readOnly={readOnly} onDelete={() => handleDelete(c)} />
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
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 border rounded-lg opacity-70">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{commissionTitle(c)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.job?.customer ? `${c.job.customer.first_name} ${c.job.customer.last_name} · ` : ""}
                    Submitted {formatDate(c.submitted_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {c.invoice_storage_path && (
                    <div className="flex items-center gap-2">
                      <a
                        href={invoiceUrl(c.invoice_storage_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View
                      </a>
                      <a
                        href={invoiceUrl(c.invoice_storage_path)}
                        download
                        className="text-slate-400 hover:text-slate-700"
                        title="Download invoice"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-700">
                      {formatCurrency(c.paid_amount ?? c.amount ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Paid {c.paid_at ? formatDate(c.paid_at) : ""}</p>
                  </div>
                  {!readOnly && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => handleDelete(c)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
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
  jobs,
  readOnly = false,
  onDelete,
}: {
  commission: CommissionWithJob;
  isOwner: boolean;
  jobs: Job[];
  readOnly?: boolean;
  onDelete: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [paying, setPaying] = useState(false);
  const [paidAmount, setPaidAmount] = useState(c.amount?.toString() ?? "");
  const [paidDate, setPaidDate] = useState(todayInputValue());
  const [method, setMethod] = useState("");
  const [loading, setLoading] = useState(false);

  // Editing (pending commissions only).
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [jobMode, setJobMode] = useState<"existing" | "freeform">(c.job_id ? "existing" : "freeform");
  const [jobId, setJobId] = useState(c.job_id ?? "");
  const [jobName, setJobName] = useState(c.job_name_freeform ?? "");
  const [editAmount, setEditAmount] = useState(c.amount?.toString() ?? "");
  const [editNotes, setEditNotes] = useState(c.notes ?? "");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  async function handleMarkPaid() {
    setLoading(true);
    await supabase.from("designer_commissions").update({
      status:         "paid",
      paid_amount:    parseFloat(paidAmount) || c.amount,
      // Store midday so the recorded day can't shift backwards when read in
      // another zone (plain "YYYY-MM-DD" parses as UTC midnight).
      paid_at:        new Date(`${paidDate}T12:00:00`).toISOString(),
      payment_method: method || null,
    }).eq("id", c.id);
    triggerBackup({ commissions: true });
    setLoading(false);
    setPaying(false);
    router.refresh();
  }

  async function handleSaveEdit() {
    if (jobMode === "existing" && !jobId) { setEditErr("Select a job or switch to a typed name."); return; }
    if (jobMode === "freeform" && !jobName.trim()) { setEditErr("Enter a job name."); return; }
    setSavingEdit(true);
    setEditErr(null);
    try {
      let invoicePath = c.invoice_storage_path;
      const file = fileRef.current?.files?.[0];
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
        const path = `${jobMode === "existing" ? jobId : "unlinked"}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("commission-invoices")
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (upErr) { setEditErr(`Couldn't upload the new file: ${upErr.message}`); setSavingEdit(false); return; }
        if (c.invoice_storage_path) {
          await supabase.storage.from("commission-invoices").remove([c.invoice_storage_path]).catch(() => {});
        }
        invoicePath = path;
      }
      await supabase.from("designer_commissions").update({
        job_id:               jobMode === "existing" ? jobId : null,
        job_name_freeform:    jobMode === "freeform" ? jobName.trim() : null,
        amount:               editAmount ? parseFloat(editAmount) : null,
        notes:                editNotes.trim() || null,
        invoice_storage_path: invoicePath,
      }).eq("id", c.id);
      triggerBackup({ commissions: true, jobId: jobMode === "existing" ? jobId : undefined });
      setSavingEdit(false);
      setEditing(false);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setEditErr(String(e));
      setSavingEdit(false);
    }
  }

  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{commissionTitle(c)}</p>
          <p className="text-xs text-muted-foreground truncate">
            {c.job?.customer ? `${c.job.customer.first_name} ${c.job.customer.last_name} · ` : ""}
            Submitted {formatDate(c.submitted_at)}
          </p>
          {c.amount && (
            <p className="text-sm font-semibold mt-1">{formatCurrency(c.amount)}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={invoiceUrl(c.invoice_storage_path)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            View Invoice
          </a>
          <a
            href={invoiceUrl(c.invoice_storage_path)}
            download
            className="text-slate-400 hover:text-slate-700"
            title="Download invoice"
          >
            <Download className="h-4 w-4" />
          </a>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => { setEditing(!editing); setPaying(false); }}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
          {isOwner && !readOnly && (
            <Button size="sm" onClick={() => { setPaying(!paying); setEditing(false); }}>
              Mark Paid
            </Button>
          )}
          {!readOnly && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="bg-slate-50 rounded-lg p-3 space-y-3 border">
          <p className="text-sm font-medium">Edit commission</p>
          <div className="space-y-1">
            <Label className="text-xs">Job</Label>
            <div className="flex gap-2 mb-1">
              <button
                type="button"
                onClick={() => setJobMode("existing")}
                className={`text-xs px-2 py-1 rounded border ${jobMode === "existing" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
              >
                Pick a job
              </button>
              <button
                type="button"
                onClick={() => setJobMode("freeform")}
                className={`text-xs px-2 py-1 rounded border ${jobMode === "freeform" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
              >
                Type a name
              </button>
            </div>
            {jobMode === "existing" ? (
              <SearchableSelect
                value={jobId}
                onValueChange={setJobId}
                options={jobs.map((j) => ({ value: j.id, label: j.title }))}
                placeholder="Select a job"
              />
            ) : (
              <Input value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder="Job name" className="h-8 text-sm" />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Amount ($)</Label>
              <Input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note / description</Label>
              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Replace file (optional)</Label>
            <input
              ref={fileRef}
              type="file"
              className="block w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-white file:text-xs file:font-medium hover:file:bg-slate-100"
            />
            <p className="text-[11px] text-muted-foreground">Leave empty to keep the current file.</p>
          </div>
          {editErr && <p className="text-xs text-destructive">{editErr}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? "Saving..." : "Save changes"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setEditErr(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {paying && isOwner && (
        <div className="bg-slate-50 rounded-lg p-3 space-y-3 border">
          <p className="text-sm font-medium">Record Payment</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
