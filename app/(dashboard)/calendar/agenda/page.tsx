import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { AgendaList } from "@/components/calendar/AgendaList";
import { customerName } from "@/lib/utils";
import { Plus, CalendarDays } from "lucide-react";
import type { CalendarEvent } from "@/lib/types/database";

export default async function CalendarAgendaPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("status", "scheduled")
    .gte("start_time", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("start_time", { ascending: true });

  const customerIds = Array.from(new Set((events ?? []).map((e) => e.customer_id).filter((id): id is string => Boolean(id))));
  const { data: customers } = customerIds.length
    ? await supabase.from("customers").select("id, first_name, last_name, city").in("id", customerIds)
    : { data: [] };

  const customerLabels: Record<string, string> = {};
  for (const c of customers ?? []) {
    customerLabels[c.id] = customerName(c) + (c.city ? ` — ${c.city}` : "");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/calendar" className="text-sm text-muted-foreground hover:underline">
            ← Calendar
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Upcoming Agenda</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/calendar">
              <CalendarDays className="h-4 w-4" /> <span className="hidden sm:inline">Month View</span>
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/calendar/new">
              <Plus className="h-4 w-4" /> New Event
            </Link>
          </Button>
        </div>
      </div>
      <AgendaList events={(events ?? []) as CalendarEvent[]} customerLabels={customerLabels} />
    </div>
  );
}
