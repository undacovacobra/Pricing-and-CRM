import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JobStageBadge } from "@/components/jobs/JobStageBadge";
import { formatCurrency, formatDate, teamMemberName } from "@/lib/utils";
import { Briefcase, Users, FileText, DollarSign, Plus, CheckCircle } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { data: jobs },
    { count: activeJobCount },
    { count: customerCount },
    { data: recentDocuments },
    { data: unpaidDocs },
    { data: recentPayments },
    { data: upcomingEvents },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, customer:customers!jobs_customer_id_fkey(first_name, last_name)")
      .not("stage", "in", '("finished","cancelled")')
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase.from("jobs").select("id", { count: "exact", head: true }).not("stage", "in", '("finished","cancelled")'),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase
      .from("documents")
      .select("*, job:jobs(title, customer:customers!jobs_customer_id_fkey(first_name, last_name))")
      .in("status", ["sent", "signed"])
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("documents")
      .select("id, deposit_amount, document_line_items(line_total)")
      .in("status", ["sent", "signed"]),
    supabase
      .from("payments")
      .select("*, job:jobs(title, customer:customers!jobs_customer_id_fkey(first_name, last_name))")
      .order("payment_date", { ascending: false })
      .limit(5),
    supabase
      .from("calendar_events")
      .select("*")
      .eq("status", "scheduled")
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(5),
  ]);

  const paymentsReceivedTotal = (recentPayments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);

  const outstandingTotal = (unpaidDocs ?? []).reduce((sum, doc) => {
    const subtotal = (doc.document_line_items as { line_total: number }[])?.reduce(
      (s: number, li: { line_total: number }) => s + (li.line_total ?? 0), 0
    ) ?? 0;
    return sum + subtotal - (doc.deposit_amount ?? 0);
  }, 0);

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
                <p className="text-2xl font-bold">{unpaidDocs?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Unpaid Invoices</p>
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
                <p className="text-xs text-muted-foreground">Paid (recent)</p>
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
          </CardHeader>
          <CardContent className="space-y-3">
            {!recentDocuments?.length && (
              <p className="text-sm text-muted-foreground py-4 text-center">No outstanding documents.</p>
            )}
            {recentDocuments?.map((doc) => {
              const job = doc.job as { title: string; customer: { first_name: string; last_name: string } | null } | null;
              return (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors border"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.document_number}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {job?.customer?.first_name} {job?.customer?.last_name} — {job?.title}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {doc.due_date ? formatDate(doc.due_date) : "No due date"}
                  </span>
                </Link>
              );
            })}
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
          </CardHeader>
          <CardContent className="space-y-3">
            {!recentPayments?.length && (
              <p className="text-sm text-muted-foreground py-4 text-center">No payments recorded yet.</p>
            )}
            {recentPayments?.map((payment) => {
              const job = payment.job as { title: string; customer: { first_name: string; last_name: string } | null } | null;
              return (
                <div key={payment.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-green-700">{formatCurrency(payment.amount)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {job?.customer?.first_name} {job?.customer?.last_name}
                      {job?.title ? ` — ${job.title}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {formatDate(payment.payment_date)}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
