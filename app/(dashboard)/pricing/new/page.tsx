import Link from "next/link";
import { PricingItemForm } from "@/components/pricing/PricingItemForm";

export default function NewPricingItemPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/pricing" className="text-sm text-muted-foreground hover:underline">
          ← Pricing Catalog
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Add Pricing Item</h1>
      </div>
      <PricingItemForm />
    </div>
  );
}
