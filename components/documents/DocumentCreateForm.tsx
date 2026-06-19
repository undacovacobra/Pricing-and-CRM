"use client";
import { useState } from "react";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { TemplateDocumentEditor } from "@/components/documents/TemplateDocumentEditor";
import type { Job, Customer, DocumentType, DocumentTemplate } from "@/lib/types/database";

interface Props {
  job:         Job & { customer: Customer | null };
  templates:   DocumentTemplate[];
  googleReady: boolean;
}

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: "quote",        label: "Quote" },
  { value: "contract",     label: "Contract" },
  { value: "invoice",      label: "Invoice" },
  { value: "change_order", label: "Change Order" },
];

export function DocumentCreateForm({ job, templates, googleReady }: Props) {
  const customer = job.customer;
  const [docType, setDocType] = useState<DocumentType>("invoice");
  const [title, setTitle] = useState(job.title);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const matchingTemplates = templates.filter((t) => t.template_type === docType);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setTitle(template.name);
  }

  return (
    <div className="space-y-4">
      {/* Document Type + Title */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Document Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={(v) => { setDocType(v as DocumentType); setSelectedTemplateId(""); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {matchingTemplates.length > 0 && (
            <div className="space-y-1.5">
              <Label>Start from Template (optional)</Label>
              <div className="flex items-center gap-2">
                <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="No template — start blank" />
                  </SelectTrigger>
                  <SelectContent>
                    {matchingTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplate && (
                  <a
                    href={`${SUPABASE_URL}/storage/v1/object/public/templates/${selectedTemplate.storage_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button type="button" variant="outline" size="sm" className="gap-1 shrink-0">
                      <ExternalLink className="h-3 w-3" /> View File
                    </Button>
                  </a>
                )}
              </div>
              {selectedTemplate && (
                <p className="text-xs text-muted-foreground">
                  Title below has been pre-filled from this template — edit it as needed.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {/* Client info (auto-filled, read-only preview) */}
          {customer && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <p className="text-xs text-muted-foreground mb-1">Bill To (auto-filled from customer)</p>
              <p className="font-medium">{customer.first_name} {customer.last_name}</p>
              {customer.email && <p className="text-muted-foreground">{customer.email}</p>}
              {customer.phone && <p className="text-muted-foreground">{customer.phone}</p>}
              {customer.address_line1 && (
                <p className="text-muted-foreground">
                  {customer.address_line1}
                  {customer.city ? `, ${customer.city}` : ""}
                  {customer.state ? `, ${customer.state}` : ""}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTemplate ? (
        <TemplateDocumentEditor jobId={job.id} title={title} template={selectedTemplate} googleReady={googleReady} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {matchingTemplates.length > 0
            ? "Select a template above to build and save this document."
            : "No templates available for this document type yet. Add one in the Templates area to create documents here."}
        </p>
      )}
    </div>
  );
}
