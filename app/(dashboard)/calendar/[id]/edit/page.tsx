import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "@/components/calendar/EventForm";
import { DeleteEventButton } from "@/components/calendar/DeleteEventButton";
import { Card, CardContent } from "@/components/ui/card";
import { customerName, formatPhoneNumber } from "@/lib/utils";
import { mapsLink } from "@/components/calendar/eventStyles";
import { Briefcase, Phone, MapPin } from "lucide-react";
import { roleFromEmail } from "@/lib/tasks/shared";
import type { Customer } from "@/lib/types/database";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: event }, { data: customers }, { data: jobs }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("calendar_events").select("*").eq("id", id).single(),
    supabase.from("customers").select("*").order("last_name", { ascending: true }),
    supabase.from("jobs").select("*, customer:customers!jobs_customer_id_fkey(first_name, last_name)").order("created_at", { ascending: false }),
  ]);
  const defaultRole = roleFromEmail(user?.email);

  if (!event) notFound();

  const jobsWithLabel = (jobs ?? []).map((j) => ({
    ...j,
    customerLabel: j.customer ? customerName(j.customer as { first_name: string; last_name: string }) : "No customer",
  }));

  // Quick-action targets pulled from the event's linked job/customer.
  const linkedJob = jobsWithLabel.find((j) => j.id === event.job_id);
  const linkedCustomer = (customers ?? []).find((c) => c.id === event.customer_id) as Customer | undefined;
  const phone = linkedCustomer?.phone ?? null;
  const directionsAddress =
    event.location ||
    (linkedCustomer
      ? [linkedCustomer.address_line1, linkedCustomer.city, linkedCustomer.state, linkedCustomer.zip].filter(Boolean).join(", ")
      : "");
  const hasQuickInfo = Boolean(linkedJob || phone || directionsAddress);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/calendar" className="text-sm text-muted-foreground hover:underline">
            ← Calendar
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Edit Event</h1>
        </div>
        <DeleteEventButton eventId={id} eventTitle={event.title} />
      </div>

      {hasQuickInfo && (
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            {linkedJob && (
              <Link
                href={`/jobs/${linkedJob.id}`}
                className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Briefcase className="h-4 w-4 text-slate-500" />
                <span className="truncate max-w-[200px]">{linkedJob.title}</span>
              </Link>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Phone className="h-4 w-4 text-slate-500" />
                {formatPhoneNumber(phone)}
              </a>
            )}
            {directionsAddress && (
              <a
                href={mapsLink(directionsAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <MapPin className="h-4 w-4 text-slate-500" />
                Directions
              </a>
            )}
          </CardContent>
        </Card>
      )}

      <EventForm event={event} customers={customers ?? []} jobs={jobsWithLabel} defaultRole={defaultRole} />
    </div>
  );
}
