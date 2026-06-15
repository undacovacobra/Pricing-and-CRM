import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CustomerForm } from "@/components/customers/CustomerForm";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (!customer) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={`/customers/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← {customer.first_name} {customer.last_name}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">Edit Customer</h1>
      </div>
      <CustomerForm customer={customer} />
    </div>
  );
}
