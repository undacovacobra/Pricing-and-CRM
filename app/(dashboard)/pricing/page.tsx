import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Plus } from "lucide-react";

export default async function PricingPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("pricing_items")
    .select("*")
    .order("category")
    .order("name");

  const categories = Array.from(new Set(items?.map((i) => i.category) ?? []));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Pricing Catalog</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/pricing/price-levels">Price Levels</Link>
          </Button>
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

      {/* Pricing Items by Category — collapsed by default */}
      {categories.map((category) => {
        const categoryItems = items?.filter((i) => i.category === category) ?? [];
        return (
          <Card key={category}>
            <details>
              <summary className="cursor-pointer list-none px-6 py-4 flex items-center justify-between">
                <span className="text-base font-semibold">{category}</span>
                <span className="text-xs text-muted-foreground">{categoryItems.length} items</span>
              </summary>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 font-medium text-muted-foreground">Item</th>
                        <th className="pb-2 font-medium text-muted-foreground text-center">Unit</th>
                        <th className="pb-2 font-medium text-muted-foreground text-right">Price</th>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </details>
          </Card>
        );
      })}
    </div>
  );
}
