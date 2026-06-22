import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatDate, customerName } from "@/lib/utils";
import { Plus } from "lucide-react";

export default async function EstimatesPage() {
  const supabase = await createClient();

  const { data: estimates } = await supabase
    .from("estimates")
    .select("*, job:jobs(id, title, customer:customers!jobs_customer_id_fkey(first_name, last_name)), estimate_line_items(line_total)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Estimates</h1>
        <Button asChild size="sm">
          <Link href="/estimates/new">
            <Plus className="h-4 w-4" />
            New Estimate
          </Link>
        </Button>
      </div>

      {(!estimates || estimates.length === 0) && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No estimates yet. Create one from a job.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {estimates?.map((est) => {
          const job = est.job as { id: string; title: string; customer: { first_name: string; last_name: string | null } | null } | null;
          const lineItems = est.estimate_line_items as { line_total: number | null }[];
          const total = lineItems.reduce((sum, li) => sum + (li.line_total ?? 0), 0);
          return (
            <Link key={est.id} href={`/estimates/${est.id}`} className="block">
              <Card className="hover:border-slate-400 transition-colors">
                <CardContent className="py-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900">{est.name}</p>
                      <span
                        className={
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium " +
                          (est.status === "submitted" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600")
                        }
                      >
                        {est.status === "submitted" ? "Submitted" : "Draft"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {job?.title ?? "—"}
                      {job?.customer ? ` · ${customerName(job.customer)}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(est.created_at)}</p>
                  </div>
                  <p className="font-mono font-semibold text-slate-900">{formatCurrency(total)}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
