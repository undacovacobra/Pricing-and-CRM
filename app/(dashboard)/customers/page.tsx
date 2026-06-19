import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CustomerList } from "@/components/customers/CustomerList";

export default async function CustomersPage() {
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("customers")
    .select("*, jobs(id, stage)")
    .order("last_name", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
        <Button asChild size="sm">
          <Link href="/customers/new">
            <Plus className="h-4 w-4" />
            New Customer
          </Link>
        </Button>
      </div>

      <CustomerList customers={customers ?? []} />
    </div>
  );
}
