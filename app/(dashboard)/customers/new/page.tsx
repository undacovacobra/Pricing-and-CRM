import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { UMBRELLA_CUSTOMER_TYPES } from "@/lib/types/database";

export default async function NewCustomerPage() {
  const supabase = await createClient();
  const { data: parents } = await supabase
    .from("customers")
    .select("*")
    .in("customer_type", UMBRELLA_CUSTOMER_TYPES)
    .order("first_name");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/customers" className="text-sm text-muted-foreground hover:underline">
          ← Customers
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">New Customer</h1>
      </div>
      <CustomerForm parents={parents ?? []} />
    </div>
  );
}
