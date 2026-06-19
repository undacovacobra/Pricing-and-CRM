"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import type { EstimateLineItem, PricingItem } from "@/lib/types/database";

const NO_SUBCATEGORY = "__none__";

export function EstimateBuilder({
  estimateId,
  pricingItems,
  initialLineItems,
}: {
  estimateId: string;
  pricingItems: PricingItem[];
  initialLineItems: EstimateLineItem[];
}) {
  const supabase = createClient();
  const [lineItems, setLineItems] = useState<EstimateLineItem[]>(initialLineItems);

  const [section, setSection] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [manualPrice, setManualPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const sections = useMemo(
    () => Array.from(new Set(pricingItems.map((i) => i.category))).sort(),
    [pricingItems]
  );

  const subcategories = useMemo(() => {
    if (!section) return [];
    return Array.from(
      new Set(
        pricingItems
          .filter((i) => i.category === section)
          .map((i) => i.subcategory ?? NO_SUBCATEGORY)
      )
    ).sort();
  }, [pricingItems, section]);

  const hasRealSubcategories = subcategories.length > 0 && subcategories[0] !== NO_SUBCATEGORY;

  const codeOptions = useMemo(() => {
    if (!section) return [];
    return pricingItems
      .filter((i) => i.category === section && (i.subcategory ?? NO_SUBCATEGORY) === (subcategory || NO_SUBCATEGORY))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pricingItems, section, subcategory]);

  const selectedItem = pricingItems.find((i) => i.id === itemId) ?? null;
  const needsManualPrice = selectedItem != null && selectedItem.unit_price == null;

  const qtyNum = parseFloat(quantity) || 0;
  const effectivePrice = needsManualPrice ? parseFloat(manualPrice) || 0 : selectedItem?.unit_price ?? 0;
  const previewTotal = qtyNum * effectivePrice;

  function resetSelection() {
    setSection("");
    setSubcategory("");
    setItemId("");
    setQuantity("1");
    setManualPrice("");
  }

  async function handleAddLine() {
    if (!selectedItem || qtyNum <= 0) return;
    if (needsManualPrice && !(parseFloat(manualPrice) > 0)) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("estimate_line_items")
      .insert({
        estimate_id: estimateId,
        pricing_item_id: selectedItem.id,
        section: selectedItem.category,
        subcategory: selectedItem.subcategory,
        code: selectedItem.name,
        unit: selectedItem.unit,
        quantity: qtyNum,
        unit_price: effectivePrice,
        sort_order: lineItems.length,
      })
      .select("*")
      .single();
    setSaving(false);

    if (!error && data) {
      setLineItems((prev) => [...prev, data as EstimateLineItem]);
      resetSelection();
    }
  }

  async function handleRemoveLine(id: string) {
    await supabase.from("estimate_line_items").delete().eq("id", id);
    setLineItems((prev) => prev.filter((li) => li.id !== id));
  }

  const grandTotal = lineItems.reduce((sum, li) => sum + (li.line_total ?? li.quantity * li.unit_price), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add Item</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Section</Label>
              <Select
                value={section}
                onValueChange={(v) => {
                  setSection(v);
                  setSubcategory("");
                  setItemId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select section..." />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasRealSubcategories && (
              <div className="space-y-1.5">
                <Label>Subcategory</Label>
                <Select
                  value={subcategory}
                  onValueChange={(v) => {
                    setSubcategory(v);
                    setItemId("");
                  }}
                  disabled={!section}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subcategory..." />
                  </SelectTrigger>
                  <SelectContent>
                    {subcategories.map((sc) => (
                      <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Item / Code</Label>
              <Select value={itemId} onValueChange={setItemId} disabled={!section || (hasRealSubcategories && !subcategory)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select item..." />
                </SelectTrigger>
                <SelectContent>
                  {codeOptions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedItem && (
            <div className="rounded-md bg-slate-50 p-3 text-sm space-y-1">
              {selectedItem.description && <p className="text-muted-foreground">{selectedItem.description}</p>}
              <p>
                Unit: <span className="font-medium">{selectedItem.unit}</span>
                {!needsManualPrice && (
                  <>
                    {" · "}Price: <span className="font-medium">{formatCurrency(selectedItem.unit_price)}</span>
                  </>
                )}
              </p>
            </div>
          )}

          {selectedItem && (
            <div className="grid sm:grid-cols-3 gap-4 items-end">
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              {needsManualPrice && (
                <div className="space-y-1.5">
                  <Label>Price ($) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    placeholder="Enter price"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Line Total</Label>
                <p className="font-mono font-semibold text-lg">{formatCurrency(previewTotal)}</p>
              </div>
            </div>
          )}

          {selectedItem && (
            <Button onClick={handleAddLine} disabled={saving || qtyNum <= 0 || (needsManualPrice && !(parseFloat(manualPrice) > 0))}>
              {saving ? "Adding..." : "Add to Estimate"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No items added yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Item</th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">Qty</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Price</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Total</th>
                    <th className="pb-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineItems.map((li) => (
                    <tr key={li.id}>
                      <td className="py-2">
                        <p className="font-medium">{li.code}</p>
                        <p className="text-xs text-muted-foreground">
                          {li.section}{li.subcategory ? ` · ${li.subcategory}` : ""}
                        </p>
                      </td>
                      <td className="py-2 text-center">{li.quantity} {li.unit}</td>
                      <td className="py-2 text-right font-mono">{formatCurrency(li.unit_price)}</td>
                      <td className="py-2 text-right font-mono font-semibold">
                        {formatCurrency(li.line_total ?? li.quantity * li.unit_price)}
                      </td>
                      <td className="py-2 text-right">
                        <button onClick={() => handleRemoveLine(li.id)} aria-label="Remove line item">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end pt-4 border-t mt-2">
                <p className="text-lg font-bold">
                  Total: <span className="font-mono">{formatCurrency(grandTotal)}</span>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
