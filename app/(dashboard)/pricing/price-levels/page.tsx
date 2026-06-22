import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PriceLevelsTable } from "@/components/pricing/PriceLevelsTable";
import type { PriceLevel } from "@/lib/types/database";

export default async function PriceLevelsPage() {
  const supabase = await createClient();

  const { data: priceLevels } = await supabase
    .from("cabinet_lines")
    .select("*")
    .order("sort_order");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/pricing" className="text-sm text-muted-foreground hover:underline">
          ← Pricing Catalog
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Price Levels</h1>
        <p className="text-sm text-muted-foreground">
          Each level multiplies catalog cost. Edit the multiplier for each door style below.
        </p>
      </div>

      <PriceLevelsTable priceLevels={(priceLevels ?? []) as PriceLevel[]} />
    </div>
  );
}
