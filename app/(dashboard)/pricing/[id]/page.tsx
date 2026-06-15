import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PricingItemForm } from "@/components/pricing/PricingItemForm";

export default async function EditPricingItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase.from("pricing_items").select("*").eq("id", id).single();
  if (!item) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/pricing" className="text-sm text-muted-foreground hover:underline">
          ← Pricing Catalog
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Edit: {item.name}</h1>
      </div>
      <PricingItemForm item={item} />
    </div>
  );
}
