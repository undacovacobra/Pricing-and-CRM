import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EstimateBuilder } from "@/components/estimates/EstimateBuilder";
import { customerName } from "@/lib/utils";
import type { PriceLevel, PricingItem } from "@/lib/types/database";

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: estimate } = await supabase
    .from("estimates")
    .select("*, job:jobs(id, title, customer:customers!jobs_customer_id_fkey(first_name, last_name))")
    .eq("id", id)
    .single();

  if (!estimate) notFound();

  const [{ data: lineItems }, { data: pricingItems }, { data: priceLevels }] = await Promise.all([
    supabase
      .from("estimate_line_items")
      .select("*")
      .eq("estimate_id", id)
      .order("sort_order"),
    supabase
      .from("pricing_items")
      .select("*")
      .eq("is_active", true)
      .order("category")
      .order("subcategory")
      .order("name"),
    supabase
      .from("cabinet_lines")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const job = estimate.job as { id: string; title: string; customer: { first_name: string; last_name: string | null } | null } | null;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/estimates" className="text-sm text-muted-foreground hover:underline">
          ← Estimates
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">{estimate.name}</h1>
        <p className="text-sm text-muted-foreground">
          {job ? (
            <>
              <Link href={`/jobs/${job.id}`} className="hover:underline">
                {job.title}
              </Link>
              {job.customer ? ` · ${customerName(job.customer)}` : ""}
            </>
          ) : (
            "—"
          )}
        </p>
      </div>

      <EstimateBuilder
        estimateId={estimate.id}
        pricingItems={(pricingItems ?? []) as PricingItem[]}
        priceLevels={(priceLevels ?? []) as PriceLevel[]}
        initialLineItems={lineItems ?? []}
        initialPriceLevelId={estimate.price_level_id}
        initialMargin={estimate.margin}
      />
    </div>
  );
}

