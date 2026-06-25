import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JobStageBadge } from "@/components/jobs/JobStageBadge";
import { formatCurrency, formatDate, customerName, teamMemberName } from "@/lib/utils";
import { jobBalance, jobPaidSince, type JobPaymentFields } from "@/lib/payments";
import { Briefcase, Users, FileText, DollarSign, Plus, CheckCircle } from "lucide-react";

interface ContractDocRow { kind: "contract" | "change_order"; amount: number | null }
interface CustomerRow { first_name: string; last_name: string | null }
type DashboardJob = JobPaymentFields & {
  id: string;
  title: string;
  stage: string;
  updated_at: string;
  customer: CustomerRow | null;
  contract_documents: ContractDocRow[] | null;
};

function contractTotals(docs: ContractDocRow[] | null) {
  let contractAmount = 0;
  let changeOrderTotal = 0;
  for (const d of docs ?? []) {
    if (d.kind === "change_order") changeOrderTotal += d.amount ?? 0;
    else contractAmount += d.amount ?? 0;
  }
  return { contractAmount, changeOrderTotal };
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    { data: activeJobs },
    { data: allJobs },
    { count: activeJobCount },
    { count: customerCount },
    { data: upcomingEvents },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, customer:customers!jobs_customer_id_fkey(first_name, last_name)")
      .not("stage", "in", '("finished","cancelled")')
      .order("updated_at", { ascending: false })
      .limit(5),
    // Every non-cancelled job, with the amounts and milestone flags needed to
    // compute outstanding balance and recent payments.
    supabase
      .from("jobs")
      .select("id, title, stage, updated_at, retainer_amount, pay_deposit_paid, pay_deposit_amount, pay_deposit_paid_at, pay_delivery_paid, pay_delivery_amount, pay_delivery_paid_at, pay_completion_paid, pay_completion_amount, pay_completion_paid_at, change_orders_paid, change_orders_paid_at, customer:customers!jobs_customer_id_fkey(first_name, last_name), contract_documents(kind, amount)")
      .neq("stage", "cancelled"),
    supabase.from("jobs").select("id", { count: "exact", head: true }).not("stage", "in", '("finished","cancelled")'),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase
      .from("calendar_events")
      .select("*")
      .eq("status", "scheduled")
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(5),
  ]);

  const jobs = activeJobs;
  const moneyJobs = (allJobs ?? []) as unknown as DashboardJob[];

  // Outstanding = sum of balance still owed across all non-cancelled jobs.
  let outstandingTotal = 0;
  // Jobs that still owe money, for the "Awaiting Payment" list.
  const awaiting: { id: string; title: string; customer: CustomerRow | null; balance: number }[] = [];
  // Individual milestone payments in the last week, for "Payments Received".
  const recentPaymentEvents: { key: string; jobId: string; title: string; customer: CustomerRow | null; amount: number; at: string }[] = [];
  let paymentsReceivedTotal = 0;

  for (const job of moneyJobs) {
    const { contractAmount, changeOrderTotal } = contractTotals(job.contract_documents);
    const { balanceDue } = jobBalance(job, contractAmount, changeOrderTotal);
    if (balanceDue > 0.005) {
      outstandingTotal += balanceDue;
      awaiting.push({ id: job.id, title: job.title, customer: job.customer, balance: balanceDue });
    }

    paymentsReceivedTotal += jobPaidSince(job, contractAmount, changeOrderTotal, weekAgo);

    const eff = (def: number, custom: number | null) => custom ?? def;
    const milestones: { label: string; paid: boolean | null; at: string | null; amount: number }[] = [
      { label: "Deposit",    paid: job.pay_deposit_paid,    at: job.pay_deposit_paid_at,    amount: eff(Math.round(contractAmount * 0.5 * 100) / 100, job.pay_deposit_amount) },
      { label: "Delivery",   paid: job.pay_delivery_paid,   at: job.pay_delivery_paid_at,   amount: eff(Math.round(contractAmount * 0.4 * 100) / 100, job.pay_delivery_amount) },
      { label: "Completion", paid: job.pay_completion_paid, at: job.pay_completion_paid_at, amount: eff(Math.round(contractAmount * 0.1 * 100) / 100, job.pay_completion_amount) },
      { label: "Change orders", paid: job.change_orders_paid, at: job.change_orders_paid_at, amount: changeOrderTotal },
    ];
    for (const m of milestones) {
      if (m.paid && m.at && new Date(m.at) >= weekAgo && m.amount > 0) {
        recentPaymentEvents.push({ key: `${job.id}-${m.label}`, jobId: job.id, title: job.title, customer: job.customer, amount: m.amount, at: m.at });
      }
    }
  }

  awaiting.sort((a, b) => b.balance - a.balance);
  recentPaymentEvents.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const awaitingTop = awaiting.slice(0, 5);
  const recentPaymentsTop = recentPaymentEvents.slice(0, 5);
  const jobsWithBalance = awaiting.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <Button asChild size="sm">
          <Link href="/jobs/new">
            <Plus className="h-4 w-4" />
            New Job
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Briefcase className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeJobCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Active Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{customerCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Customers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <FileText className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{jobsWithBalance}</p>
                <p className="text-xs text-muted-foreground">Jobs Owing</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{formatCurrency(outstandingTotal)}</p>
                <p className="text-xs text-muted-foreground">Outstanding</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold">{formatCurrency(paymentsReceivedTotal)}</p>
                <p className="text-xs text-muted-foreground">Paid (7 days)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Recent Active Jobs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Active Jobs</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/jobs">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {!jobs?.length && (
              <p className="text-sm text-muted-foreground py-4 text-center">No active jobs yet.</p>
            )}
            {jobs?.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors border"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{job.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {(job.customer as { first_name: string; last_name: string } | null)?.first_name}{" "}
                    {(job.customer as { first_name: string; last_name: string } | null)?.last_name}
                  </p>
                </div>
                <div className="shrink-0 ml-2">
                  <JobStageBadge stage={job.stage} />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Awaiting Payment */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Awaiting Payment</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/jobs">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {!awaitingTop.length && (
              <p className="text-sm text-muted-foreground py-4 text-center">Everything&apos;s paid up.</p>
            )}
            {awaitingTop.map((j) => (
              <Link
                key={j.id}
                href={`/jobs/${j.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors border"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{j.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {j.customer ? customerName(j.customer) : "No customer"}
                  </p>
                </div>
                <span className="text-sm font-semibold text-orange-600 shrink-0 ml-2">
                  {formatCurrency(j.balance)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming Appointments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Upcoming Appointments</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/calendar">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {!upcomingEvents?.length && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nothing scheduled.</p>
            )}
            {upcomingEvents?.map((event) => (
              <Link
                key={event.id}
                href={`/calendar/${event.id}/edit`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors border"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{event.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{teamMemberName(event.assigned_to)}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(event.start_time))}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Recent Payments Received */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Payments Received</CardTitle>
            <span className="text-xs text-muted-foreground">Last 7 days</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {!recentPaymentsTop.length && (
              <p className="text-sm text-muted-foreground py-4 text-center">No payments in the last week.</p>
            )}
            {recentPaymentsTop.map((p) => (
              <Link
                key={p.key}
                href={`/jobs/${p.jobId}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors border"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-green-700">{formatCurrency(p.amount)}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.customer ? `${customerName(p.customer)} — ` : ""}{p.title}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {formatDate(p.at)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
