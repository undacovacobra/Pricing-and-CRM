"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { TemplateDocumentEditor } from "@/components/documents/TemplateDocumentEditor";
import type { Job, Customer, PricingItem, CabinetLine, AppSettings, DocumentType, DocumentTemplate } from "@/lib/types/database";

interface LineItemDraft {
  pricing_item_id: string | null;
  name:            string;
  description:     string;
  quantity:        number;
  unit:            string;
  unit_price:      number;
  sort_order:      number;
}

interface Props {
  job:           Job & { customer: Customer | null };
  pricingItems:  PricingItem[];
  cabinetLines:  CabinetLine[];
  settings:      AppSettings | null;
  templates:     DocumentTemplate[];
  googleReady:   boolean;
}

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: "quote",        label: "Quote" },
  { value: "contract",     label: "Contract" },
  { value: "invoice",      label: "Invoice" },
  { value: "change_order", label: "Change Order" },
];

export function DocumentCreateForm({ job, pricingItems, cabinetLines, settings, templates, googleReady }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const customer = job.customer;
  const [docType, setDocType] = useState<DocumentType>("invoice");
  const [title, setTitle] = useState(job.title);
  const [clientNotes, setClientNotes] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [taxRate, setTaxRate] = useState(((settings?.default_tax_rate ?? 0) * 100).toString());
  const [depositAmount, setDepositAmount] = useState("0");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([]);
  const [selectedCabinetLine, setSelectedCabinetLine] = useState<string>(
    cabinetLines.find((l) => l.is_base)?.id ?? ""
  );
  const [saving, setSaving] = useState(false);

  const activeCabinetLine = cabinetLines.find((l) => l.id === selectedCabinetLine);
  const matchingTemplates = templates.filter((t) => t.template_type === docType);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setTitle(template.name);
    if (template.notes) setClientNotes(template.notes);
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      { pricing_item_id: null, name: "", description: "", quantity: 1, unit: "each", unit_price: 0, sort_order: prev.length },
    ]);
  }

  function addFromCatalog(item: PricingItem) {
    const price = item.applies_to_cabinet_lines && activeCabinetLine
      ? item.unit_price * activeCabinetLine.multiplier
      : item.unit_price;
    setLineItems((prev) => [
      ...prev,
      {
        pricing_item_id: item.id,
        name:            item.name,
        description:     item.description ?? "",
        quantity:        1,
        unit:            item.unit,
        unit_price:      price,
        sort_order:      prev.length,
      },
    ]);
  }

  function updateLineItem(index: number, field: keyof LineItemDraft, value: string | number) {
    setLineItems((prev) => prev.map((li, i) => i === index ? { ...li, [field]: value } : li));
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
  const taxAmount = subtotal * (parseFloat(taxRate) / 100 || 0);
  const discount = parseFloat(discountAmount) || 0;
  const deposit = parseFloat(depositAmount) || 0;
  const total = subtotal + taxAmount - discount;
  const balanceDue = total - deposit;

  async function handleSave() {
    if (lineItems.length === 0) return alert("Add at least one line item.");
    setSaving(true);

    // Get auto-generated document number
    const { data: numResult } = await supabase.rpc("next_document_number", { doc_type: docType });

    const { data: doc, error } = await supabase.from("documents").insert({
      job_id:          job.id,
      document_type:   docType,
      document_number: numResult as string,
      title:           title || job.title,
      client_notes:    clientNotes || null,
      tax_rate:        parseFloat(taxRate) / 100 || 0,
      discount_amount: discount,
      deposit_amount:  deposit,
      due_date:        dueDate || null,
      status:          "draft",
    }).select().single();

    if (error || !doc) {
      console.error(error);
      setSaving(false);
      return;
    }

    await supabase.from("document_line_items").insert(
      lineItems.map((li, i) => ({
        document_id:     doc.id,
        pricing_item_id: li.pricing_item_id,
        sort_order:      i,
        name:            li.name,
        description:     li.description || null,
        quantity:        li.quantity,
        unit:            li.unit,
        unit_price:      li.unit_price,
      }))
    );

    router.push(`/documents/${doc.id}`);
    router.refresh();
  }

  const categories = Array.from(new Set(pricingItems.map((i) => i.category)));

  return (
    <div className="space-y-4">
      {/* Document Type + Title */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Document Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
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
                  Title and client notes below have been pre-filled from this template — edit them as needed.
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
      <>
      {/* Cabinet Line Selector */}
      {cabinetLines.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-4">
              <Label className="shrink-0">Cabinet Line for this job:</Label>
              <Select value={selectedCabinetLine} onValueChange={setSelectedCabinetLine}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cabinetLines.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} ({l.multiplier}×)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Prices for cabinet items will reflect this line&apos;s multiplier.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Catalog Picker */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add from Pricing Catalog</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {categories.map((category) => (
            <div key={category}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{category}</p>
              <div className="flex flex-wrap gap-2">
                {pricingItems.filter((i) => i.category === category).map((item) => {
                  const price = item.applies_to_cabinet_lines && activeCabinetLine
                    ? item.unit_price * activeCabinetLine.multiplier
                    : item.unit_price;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addFromCatalog(item)}
                      className="text-xs border rounded-full px-3 py-1 hover:bg-slate-100 transition-colors flex items-center gap-1"
                    >
                      {item.name} <span className="text-muted-foreground">{formatCurrency(price)}/{item.unit}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Line Items</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
            <Plus className="h-4 w-4" /> Add Item
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lineItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No items yet. Add from the catalog above or click &quot;Add Item&quot;.
            </p>
          )}
          {lineItems.map((li, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-3">
              <div className="col-span-12 md:col-span-4 space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={li.name}
                  onChange={(e) => updateLineItem(index, "name", e.target.value)}
                  placeholder="Item name"
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-4 md:col-span-2 space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={li.quantity}
                  onChange={(e) => updateLineItem(index, "quantity", parseFloat(e.target.value) || 0)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-4 md:col-span-2 space-y-1">
                <Label className="text-xs">Unit</Label>
                <Input
                  value={li.unit}
                  onChange={(e) => updateLineItem(index, "unit", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-4 md:col-span-2 space-y-1">
                <Label className="text-xs">Unit Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={li.unit_price}
                  onChange={(e) => updateLineItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-8 md:col-span-1 text-right space-y-1">
                <Label className="text-xs">Total</Label>
                <p className="text-sm font-mono font-medium py-1">{formatCurrency(li.quantity * li.unit_price)}</p>
              </div>
              <div className="col-span-4 md:col-span-1 flex justify-end">
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLineItem(index)} className="h-8 w-8 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="col-span-12 space-y-1">
                <Input
                  value={li.description}
                  onChange={(e) => updateLineItem(index, "description", e.target.value)}
                  placeholder="Description (optional)"
                  className="h-7 text-xs"
                />
              </div>
            </div>
          ))}

          {/* Totals */}
          {lineItems.length > 0 && (
            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Tax</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="h-6 w-16 text-xs text-center"
                  />
                  <span className="text-muted-foreground text-xs">%</span>
                </div>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold border-t pt-2">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              {deposit > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Deposit</span>
                  <span>-{formatCurrency(deposit)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>Balance Due</span>
                <span>{formatCurrency(balanceDue)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discount + Deposit */}
      <Card>
        <CardContent className="pt-4 pb-4 grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="discount">Discount ($)</Label>
            <Input id="discount" type="number" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deposit">Deposit / Amount Received ($)</Label>
            <Input id="deposit" type="number" step="0.01" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label>Notes for Client</Label>
        <Textarea value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} placeholder="Payment instructions, terms, etc." rows={3} />
      </div>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving || lineItems.length === 0}>
          {saving ? "Creating..." : "Create Document"}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
      </>
      )}
    </div>
  );
}
