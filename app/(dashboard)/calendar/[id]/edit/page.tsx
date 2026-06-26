import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "@/components/calendar/EventForm";
import { DeleteEventButton } from "@/components/calendar/DeleteEventButton";
import { customerName } from "@/lib/utils";
import { roleFromEmail } from "@/lib/tasks/shared";

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
      <EventForm event={event} customers={customers ?? []} jobs={jobsWithLabel} defaultRole={defaultRole} />
    </div>
  );
}
