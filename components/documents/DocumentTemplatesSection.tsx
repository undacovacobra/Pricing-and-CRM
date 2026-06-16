"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { FileText, Trash2, Download } from "lucide-react";
import type { DocumentTemplate } from "@/lib/types/database";

const TYPE_LABELS: Record<string, string> = {
  contract:     "Contract",
  invoice:      "Invoice",
  change_order: "Change Order",
  other:        "Other",
};

export function DocumentTemplatesSection({ templates }: { templates: DocumentTemplate[] }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("contract");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !name.trim()) { setError("Name and file are required."); return; }
    setError(null);
    setUploading(true);

    const path = `${type}/${Date.now()}-${file.name}`;

    const { error: uploadErr } = await supabase.storage.from("templates").upload(path, file);
    if (uploadErr) { setError(uploadErr.message); setUploading(false); return; }

    const { error: dbErr } = await supabase.from("document_templates").insert({
      name:          name.trim(),
      template_type: type,
      storage_path:  path,
      file_name:     file.name,
      notes:         notes.trim() || null,
    });

    if (dbErr) { setError(dbErr.message); setUploading(false); return; }

    setName(""); setNotes(""); setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function handleDelete(template: DocumentTemplate) {
    if (!confirm(`Delete "${template.name}"?`)) return;
    await supabase.storage.from("templates").remove([template.storage_path]);
    await supabase.from("document_templates").delete().eq("id", template.id);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Upload form */}
      <div className="grid md:grid-cols-4 gap-3 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Template Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Standard Contract 2026"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Notes (optional)</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Version, notes..."
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">File (PDF, Word, etc.)</Label>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg" className="block w-full text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-100 file:text-xs file:font-medium hover:file:bg-slate-200" />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button size="sm" onClick={handleUpload} disabled={uploading}>
        {uploading ? "Uploading..." : "Upload Template"}
      </Button>

      {/* Template list */}
      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No templates uploaded yet. Add your blank contracts, invoices, and change orders above.</p>
      ) : (
        <div className="space-y-2">
          {["contract", "invoice", "change_order", "other"].map((sectionType) => {
            const sectionTemplates = templates.filter((t) => t.template_type === sectionType);
            if (!sectionTemplates.length) return null;
            return (
              <div key={sectionType}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{TYPE_LABELS[sectionType]}</h3>
                <div className="space-y-2">
                  {sectionTemplates.map((t) => {
                    const url = `${SUPABASE_URL}/storage/v1/object/public/templates/${t.storage_path}`;
                    return (
                      <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{t.name}</p>
                            <p className="text-xs text-muted-foreground">{t.file_name} · {formatDate(t.created_at)}</p>
                            {t.notes && <p className="text-xs text-muted-foreground italic">{t.notes}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="h-7 px-2">
                              <Download className="h-3 w-3" />
                            </Button>
                          </a>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(t)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
