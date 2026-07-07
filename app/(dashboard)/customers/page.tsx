import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CustomerList } from "@/components/customers/CustomerList";
import { roleFromUser } from "@/lib/auth/roles";

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const installer = roleFromUser(user) === "installer";

  const { data: customers } = await supabase
    .from("customers")
    .select("*, jobs:jobs!jobs_customer_id_fkey(id, stage), parent_jobs:jobs!jobs_parent_customer_id_fkey(id, stage)")
    .order("last_name", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
        {!installer && (
          <Button asChild size="sm">
            <Link href="/customers/new">
              <Plus className="h-4 w-4" />
              New Customer
            </Link>
          </Button>
        )}
      </div>

      <CustomerList customers={customers ?? []} />
    </div>
  );
}
