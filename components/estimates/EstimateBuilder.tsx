"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemCombobox } from "@/components/estimates/ItemCombobox";
import { formatCurrency } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import type { EstimateLineItem, PricingItem } from "@/lib/types/database";

const NO_SUBCATEGORY = "__none__";

type CategoryGroup = {
  category: string;
  subgroups: { subcategory: string | null; items: PricingItem[] }[];
};

type Selection = { itemId: string; quantity: string; manualPrice: string };

const emptySelection: Selection = { itemId: "", quantity: "1", manualPrice: "" };

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
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  // Build category -> subcategory -> items structure, preserving sorted order.
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const byCategory = new Map<string, Map<string, PricingItem[]>>();
    for (const item of pricingItems) {
      const subKey = item.subcategory ?? NO_SUBCATEGORY;
      if (!byCategory.has(item.category)) byCategory.set(item.category, new Map());
      const subMap = byCategory.get(item.category)!;
      if (!subMap.has(subKey)) subMap.set(subKey, []);
      subMap.get(subKey)!.push(item);
    }
    return Array.from(byCategory.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, subMap]) => ({
        category,
        subgroups: Array.from(subMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([subKey, items]) => ({
            subcategory: subKey === NO_SUBCATEGORY ? null : subKey,
            items: items.sort((a, b) => a.name.localeCompare(b.name)),
          })),
      }));
  }, [pricingItems]);

  const itemById = useMemo(() => {
    const map = new Map<string, PricingItem>();
    for (const item of pricingItems) map.set(item.id, item);
    return map;
  }, [pricingItems]);

  function getSelection(category: string): Selection {
    return selections[category] ?? emptySelection;
  }

  function updateSelection(category: string, patch: Partial<Selection>) {
    setSelections((prev) => ({
      ...prev,
      [category]: { ...(prev[category] ?? emptySelection), ...patch },
    }));
  }

  async function handleAdd(category: string) {
    const sel = getSelection(category);
    const item = itemById.get(sel.itemId);
    if (!item) return;

    const qtyNum = parseFloat(sel.quantity) || 0;
    if (qtyNum <= 0) return;

    const needsManualPrice = item.unit_price == null;
    const price = needsManualPrice ? parseFloat(sel.manualPrice) || 0 : item.unit_price ?? 0;
    if (needsManualPrice && !(price > 0)) return;

    setSavingCategory(category);
    const { data, error } = await supabase
      .from("estimate_line_items")
      .insert({
        estimate_id: estimateId,
        pricing_item_id: item.id,
        section: item.category,
        subcategory: item.subcategory,
        code: item.name,
        unit: item.unit,
        quantity: qtyNum,
        unit_price: price,
        sort_order: lineItems.length,
      })
      .select("*")
      .single();
    setSavingCategory(null);

    if (!error && data) {
      setLineItems((prev) => [...prev, data as EstimateLineItem]);
      setSelections((prev) => ({ ...prev, [category]: { ...emptySelection } }));
    }
  }

  async function handleRemoveLine(id: string) {
    await supabase.from("estimate_line_items").delete().eq("id", id);
    setLineItems((prev) => prev.filter((li) => li.id !== id));
  }

  const grandTotal = lineItems.reduce(
    (sum, li) => sum + (li.line_total ?? li.quantity * li.unit_price),
    0
  );

  return (
    <div className="space-y-6">
      {/* Category sections */}
      <div className="space-y-4">
        {categoryGroups.map((group) => {
          const sel = getSelection(group.category);
          const selectedItem = sel.itemId ? itemById.get(sel.itemId) ?? null : null;
          const needsManualPrice = selectedItem != null && selectedItem.unit_price == null;
          const qtyNum = parseFloat(sel.quantity) || 0;
          const price = needsManualPrice
            ? parseFloat(sel.manualPrice) || 0
            : selectedItem?.unit_price ?? 0;
          const lineTotal = qtyNum * price;
          const canAdd =
            selectedItem != null &&
            qtyNum > 0 &&
            (!needsManualPrice || parseFloat(sel.manualPrice) > 0);

          return (
            <Card key={group.category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{group.category}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
                  <div className="space-y-1.5">
                    <Label>Item</Label>
                    <ItemCombobox
                      subgroups={group.subgroups}
                      value={sel.itemId}
                      onChange={(id) => updateSelection(group.category, { itemId: id })}
                    />
                  </div>

                  <div className="space-y-1.5 w-24">
                    <Label>Qty</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={sel.quantity}
                      onChange={(e) => updateSelection(group.category, { quantity: e.target.value })}
                    />
                  </div>

                  {needsManualPrice && (
                    <div className="space-y-1.5 w-28">
                      <Label>Price ($)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={sel.manualPrice}
                        onChange={(e) =>
                          updateSelection(group.category, { manualPrice: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>
                  )}

                  <Button
                    onClick={() => handleAdd(group.category)}
                    disabled={!canAdd || savingCategory === group.category}
                  >
                    {savingCategory === group.category ? "Adding..." : "Add"}
                  </Button>
                </div>

                {selectedItem && (
                  <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">
                      {selectedItem.description || selectedItem.name}
                    </span>
                    <span className="font-mono font-semibold whitespace-nowrap pl-3">
                      {formatCurrency(lineTotal)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Running line items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Estimate Line Items</CardTitle>
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
                          {li.section}
                          {li.subcategory ? ` · ${li.subcategory}` : ""}
                        </p>
                      </td>
                      <td className="py-2 text-center">
                        {li.quantity} {li.unit}
                      </td>
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
