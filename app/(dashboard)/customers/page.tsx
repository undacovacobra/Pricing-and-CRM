import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, ChevronRight, Phone, Mail } from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils";

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

      {!customers?.length && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No customers yet.</p>
            <Button asChild size="sm">
              <Link href="/customers/new">Add your first customer</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {customers?.map((customer) => {
          const jobs = customer.jobs as { id: string; stage: string }[] | null;
          const activeJobs = jobs?.filter((j) => !["complete", "cancelled"].includes(j.stage)) ?? [];
          return (
            <Link key={customer.id} href={`/customers/${customer.id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">
                      {customer.first_name} {customer.last_name}
                    </p>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {customer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {formatPhoneNumber(customer.phone)}
                        </span>
                      )}
                      {customer.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {customer.email}
                        </span>
                      )}
                    </div>
                    {customer.city && (
                      <p className="text-xs text-muted-foreground">
                        {customer.city}{customer.state ? `, ${customer.state}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {activeJobs.length > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        {activeJobs.length} active {activeJobs.length === 1 ? "job" : "jobs"}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
