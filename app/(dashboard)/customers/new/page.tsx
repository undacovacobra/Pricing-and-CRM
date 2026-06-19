import Link from "next/link";
import { CustomerForm } from "@/components/customers/CustomerForm";

export default async function NewCustomerPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/customers" className="text-sm text-muted-foreground hover:underline">
          ← Customers
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">New Customer</h1>
      </div>
      <CustomerForm />
    </div>
  );
}
