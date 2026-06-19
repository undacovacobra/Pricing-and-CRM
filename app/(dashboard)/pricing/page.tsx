import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Plus, Pencil } from "lucide-react";

export default async function PricingPage() {
  const supabase = await createClient();

  const [{ data: items }, { data: cabinetLines }] = await Promise.all([
    supabase.from("pricing_items").select("*").order("category").order("name"),
    supabase.from("cabinet_lines").select("*").order("sort_order"),
  ]);

  const categories = Array.from(new Set(items?.map((i) => i.category) ?? []));

  const baseLine = cabinetLines?.find((l) => l.is_base);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Pricing Catalog</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/estimates">Estimates</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/pricing/new">
              <Plus className="h-4 w-4" />
              Add Item
            </Link>
          </Button>
        </div>
      </div>

      {/* Cabinet Lines / Multipliers */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Cabinet Lines</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/pricing/cabinet-lines">Manage Lines</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Line</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Multiplier</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Effect</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cabinetLines?.map((line) => (
                  <tr key={line.id}>
                    <td className="py-2">
                      <span className="font-medium">{line.name}</span>
                      {line.is_base && (
                        <Badge variant="secondary" className="ml-2 text-xs">Base</Badge>
                      )}
                      {line.description && (
                        <p className="text-xs text-muted-foreground">{line.description}</p>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono">{line.multiplier}×</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {baseLine && !line.is_base
                        ? `${Math.round((line.multiplier - 1) * 100)}% above base`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Items by Category */}
      {categories.map((category) => {
        const categoryItems = items?.filter((i) => i.category === category) ?? [];
        return (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{category}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Item</th>
                      <th className="pb-2 font-medium text-muted-foreground text-center">Unit</th>
                      <th className="pb-2 font-medium text-muted-foreground text-right">Base Price</th>
                      {cabinetLines?.filter((l) => !l.is_base).map((line) => (
                        <th key={line.id} className="pb-2 font-medium text-muted-foreground text-right hidden md:table-cell">
                          {line.name}
                        </th>
                      ))}
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {categoryItems.map((item) => (
                      <tr key={item.id} className={item.is_active ? "" : "opacity-40"}>
                        <td className="py-2">
                          <p className="font-medium">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          )}
                        </td>
                        <td className="py-2 text-center text-muted-foreground">{item.unit}</td>
                        <td className="py-2 text-right font-mono">{formatCurrency(item.unit_price)}</td>
                        {cabinetLines?.filter((l) => !l.is_base).map((line) => (
                          <td key={line.id} className="py-2 text-right font-mono text-muted-foreground hidden md:table-cell">
                            {item.applies_to_cabinet_lines && item.unit_price != null
                              ? formatCurrency(item.unit_price * line.multiplier)
                              : "—"}
                          </td>
                        ))}
                        <td className="py-2 text-right">
                          <Link href={`/pricing/${item.id}`}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-slate-900 transition-colors" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
