import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "@/components/calendar/EventForm";
import { customerName } from "@/lib/utils";
import { roleFromEmail } from "@/lib/tasks/shared";

async function NewEventContent() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: customers }, { data: jobs }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("customers").select("*").order("last_name", { ascending: true }),
    supabase.from("jobs").select("*, customer:customers!jobs_customer_id_fkey(first_name, last_name)").order("created_at", { ascending: false }),
  ]);
  const defaultRole = roleFromEmail(user?.email);

  const jobsWithLabel = (jobs ?? []).map((j) => ({
    ...j,
    customerLabel: j.customer ? customerName(j.customer as { first_name: string; last_name: string }) : "No customer",
  }));

  return <EventForm customers={customers ?? []} jobs={jobsWithLabel} defaultRole={defaultRole} />;
}

export default function NewEventPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/calendar" className="text-sm text-muted-foreground hover:underline">
          ← Calendar
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">New Event</h1>
      </div>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
        <NewEventContent />
      </Suspense>
    </div>
  );
}
