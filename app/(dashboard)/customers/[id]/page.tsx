import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStageBadge } from "@/components/jobs/JobStageBadge";
import { DeleteCustomerButton } from "@/components/customers/DeleteCustomerButton";
import { formatCurrency, formatDate, formatPhoneNumber, customerName } from "@/lib/utils";
import { Phone, Mail, MapPin, Pencil, Plus, Briefcase, FolderOpen, CalendarDays } from "lucide-react";
import { CUSTOMER_TYPE_LABELS, type CustomerType, type JobStage } from "@/lib/types/database";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

  if (!customer) notFound();

  // Jobs directly for this customer, plus (for umbrella customers) jobs grouped
  // under them via parent_customer_id.
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .or(`customer_id.eq.${id},parent_customer_id.eq.${id}`)
    .order("created_at", { ascending: false });

  const { data: communications } = await supabase
    .from("communications")
    .select("*")
    .eq("customer_id", id)
    .order("occurred_at", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/customers" className="text-sm text-muted-foreground hover:underline">
            ← Customers
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 truncate">
            {customerName(customer)}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
              {CUSTOMER_TYPE_LABELS[customer.customer_type as CustomerType]}
            </span>
            {customer.google_drive_folder_url && (
              <a
                href={customer.google_drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <FolderOpen className="h-3 w-3" /> Master Drive folder
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href={`/calendar/new?customer=${id}`}>
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">Schedule</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/customers/${id}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </Button>
          <DeleteCustomerButton customerId={id} customerName={customerName(customer)} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Contact Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Contact Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {customer.phone && (
              <div className="flex items-center gap-2 text-slate-700">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`tel:${customer.phone}`} className="hover:underline">
                  {formatPhoneNumber(customer.phone)}
                </a>
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-2 text-slate-700">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${customer.email}`} className="hover:underline">
                  {customer.email}
                </a>
              </div>
            )}
            {customer.address_line1 && (
              <div className="flex items-start gap-2 text-slate-700">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p>{customer.address_line1}</p>
                  {customer.address_line2 && <p>{customer.address_line2}</p>}
                  {customer.city && (
                    <p>{customer.city}{customer.state ? `, ${customer.state}` : ""} {customer.zip}</p>
                  )}
                </div>
              </div>
            )}
            {customer.notes && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm">{customer.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Jobs */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Jobs ({jobs?.length ?? 0})
            </h2>
            <Button asChild size="sm">
              <Link href={`/jobs/new?customer_id=${id}`}>
                <Plus className="h-4 w-4" />
                New Job
              </Link>
            </Button>
          </div>

          {!jobs?.length && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No jobs yet for this customer.
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {jobs?.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`}>
                <Card className="hover:shadow-sm transition-shadow">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium text-sm">{job.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {job.estimated_value ? formatCurrency(job.estimated_value) : "Value TBD"}
                        {job.start_date ? ` · Started ${formatDate(job.start_date)}` : ""}
                      </p>
                    </div>
                    <JobStageBadge stage={job.stage as JobStage} />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Communication Log */}
          {(communications?.length ?? 0) > 0 && (
            <div className="space-y-2 pt-2">
              <h2 className="font-semibold text-slate-900 text-sm">Recent Communications</h2>
              {communications?.map((c) => (
                <div key={c.id} className="border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium capitalize">{c.channel} ({c.direction})</span>
                    <span className="text-xs text-muted-foreground">{formatDate(c.occurred_at)}</span>
                  </div>
                  <p className="text-muted-foreground">{c.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
