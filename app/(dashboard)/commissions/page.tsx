import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { CommissionList } from "@/components/commissions/CommissionList";
import { NewCommissionForm } from "@/components/commissions/NewCommissionForm";

export default async function CommissionsPage() {
  const supabase = await createClient();

  const [{ data: commissions }, { data: jobs }, { data: userData }] = await Promise.all([
    supabase
      .from("designer_commissions")
      .select("*, job:jobs(title, customer:customers(first_name, last_name))")
      .order("submitted_at", { ascending: false }),
    supabase.from("jobs").select("*").order("title"),
    supabase.auth.getUser(),
  ]);

  let isOwner = false;
  if (userData?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    isOwner = profile?.role === "owner";
  }

  const pending = commissions?.filter((c) => c.status === "pending") ?? [];
  const paid = commissions?.filter((c) => c.status === "paid") ?? [];

  const totalPending = pending.reduce((sum, c) => sum + (c.amount ?? 0), 0);
  const totalPaid = paid.reduce((sum, c) => sum + (c.paid_amount ?? c.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Designer Commissions</h1>
        <p className="text-sm text-muted-foreground mt-1">Track commission invoices submitted by the designer</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Pending Payment</p>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalPending)}</p>
            <p className="text-xs text-muted-foreground">{pending.length} invoice{pending.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Paid (All Time)</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-muted-foreground">{paid.length} invoice{paid.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
      </div>

      <NewCommissionForm jobs={jobs ?? []} />

      <CommissionList commissions={commissions ?? []} isOwner={isOwner} />
    </div>
  );
}
