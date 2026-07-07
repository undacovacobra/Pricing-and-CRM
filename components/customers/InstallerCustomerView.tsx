import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStageBadge } from "@/components/jobs/JobStageBadge";
import { formatPhoneNumber, customerName } from "@/lib/utils";
import { mapsLink } from "@/components/calendar/eventStyles";
import { Phone, Mail, MapPin, Briefcase } from "lucide-react";
import type { Customer, JobStage } from "@/lib/types/database";

interface InstallerJobRow {
  id: string;
  title: string;
  stage: string;
  job_address: string | null;
}

// Read-only customer view for installers: contact + address + their jobs. No money.
export function InstallerCustomerView({ customer, jobs }: { customer: Customer; jobs: InstallerJobRow[] }) {
  const fullAddress = [customer.address_line1, customer.city, customer.state, customer.zip].filter(Boolean).join(", ");
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Link href="/customers" className="text-sm text-muted-foreground hover:underline">← Customers</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">{customerName(customer)}</h1>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Contact</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {customer.phone && (
            <div className="flex items-center gap-2 text-slate-700">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <a href={`tel:${customer.phone}`} className="hover:underline">{formatPhoneNumber(customer.phone)}</a>
            </div>
          )}
          {customer.email && (
            <div className="flex items-center gap-2 text-slate-700">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <a href={`mailto:${customer.email}`} className="hover:underline">{customer.email}</a>
            </div>
          )}
          {fullAddress && (
            <div className="flex items-start gap-2 text-slate-700">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <a href={mapsLink(fullAddress)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {fullAddress}
              </a>
            </div>
          )}
          {customer.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
          <Briefcase className="h-4 w-4" /> Jobs ({jobs.length})
        </h2>
        {!jobs.length && <p className="text-sm text-muted-foreground">No jobs.</p>}
        {jobs.map((job) => (
          <Link key={job.id} href={`/jobs/${job.id}`}>
            <Card className="hover:shadow-sm transition-shadow">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{job.title}</p>
                  {job.job_address && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{job.job_address}</span>
                    </p>
                  )}
                </div>
                <JobStageBadge stage={job.stage as JobStage} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
