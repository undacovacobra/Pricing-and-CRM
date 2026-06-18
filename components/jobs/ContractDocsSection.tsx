"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Trash2, FileText } from "lucide-react";
import type { ContractDocument } from "@/lib/types/database";

interface Props {
  jobId: string;
  kind:  "contract" | "change_order";
  items: ContractDocument[];
}

export function ContractDocsSection({ jobId, kind, items }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = kind === "contract" ? "Contract" : "Change Order";

  async function handleAdd() {
    const file = fileRef.current?.files?.[0];
    if (!file && !amount) { setError("Add a file or an amount."); return; }
    setError(null);
    setSaving(true);

    let storagePath: string | null = null;
    let storedFileName: string | null = null;
    if (file) {
      const path = `${jobId}/${kind}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("job-attachments").upload(path, file);
      if (uploadErr) { setError(uploadErr.message); setSaving(false); return; }
      storagePath = path;
      storedFileName = file.name;
    }

    const { error: dbErr } = await supabase.from("contract_documents").insert({
      job_id:       jobId,
      kind,
      storage_path: storagePath,
      file_name:    storedFileName,
      amount:       amount ? parseFloat(amount) : null,
      description:  description.trim() || null,
    });
    if (dbErr) { setError(dbErr.message); setSaving(false); return; }

    setAmount(""); setDescription(""); setFileName("");
    if (fileRef.current) fileRef.current.value = "";
    setSaving(false);
    setAdding(false);
    router.refresh();
  }

  async function handleDelete(item: ContractDocument) {
    if (!confirm(`Remove this ${label.toLowerCase()}?`)) return;
    if (item.storage_path) await supabase.storage.from("job-attachments").remove([item.storage_path]);
    await supabase.from("contract_documents").delete().eq("id", item.id);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground text-center py-2">No {label.toLowerCase()}s yet.</p>
      )}

      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between p-2 border rounded-lg hover:bg-slate-50">
          <div className="min-w-0">
            {item.storage_path ? (
              <a
                href={`${SUPABASE_URL}/storage/v1/object/public/job-attachments/${item.storage_path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                <FileText className="h-3 w-3" /> {item.file_name ?? "View file"}
              </a>
            ) : (
              <p className="text-sm font-medium">{item.description || label}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {item.description && item.storage_path ? `${item.description} · ` : ""}
              {formatDate(item.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="text-sm font-semibold">{item.amount != null ? formatCurrency(item.amount) : "—"}</span>
            <Button size="sm" variant="outline" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(item)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}

      {adding ? (
        <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
          <p className="text-sm font-medium">Add {label}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Amount ($)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. CO #1 — added island" className="h-8 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">File (optional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              className="block w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-100 file:text-xs file:font-medium hover:file:bg-slate-200"
            />
            {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving}>{saving ? "Saving..." : `Add ${label}`}</Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setError(null); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setAdding(true)}>
          <Plus className="h-3 w-3 mr-1" /> Add {label}
        </Button>
      )}
    </div>
  );
}
