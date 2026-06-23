import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { DayDetailPanel } from "@/components/calendar/DayDetailPanel";
import { customerName } from "@/lib/utils";
import { Plus, List } from "lucide-react";
import type { CalendarEvent } from "@/lib/types/database";

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseMonthParam(month?: string): Date {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const { month, day } = await searchParams;
  const monthDate = parseMonthParam(month);

  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), 1 - firstOfMonth.getDay());
  const gridEnd = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 42);

  const supabase = await createClient();
  const { data: events } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("status", "scheduled")
    .gte("start_time", gridStart.toISOString())
    .lt("start_time", gridEnd.toISOString())
    .order("start_time", { ascending: true });

  const eventsByDay: Record<string, CalendarEvent[]> = {};
  for (const event of (events ?? []) as CalendarEvent[]) {
    const key = dayKey(new Date(event.start_time));
    (eventsByDay[key] ??= []).push(event);
  }

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
        <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/calendar/agenda">
              <List className="h-4 w-4" /> <span className="hidden sm:inline">List View</span>
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/calendar/new">
              <Plus className="h-4 w-4" /> New Event
            </Link>
          </Button>
        </div>
      </div>

      <MonthCalendar monthDate={monthDate} eventsByDay={eventsByDay} selectedDay={day} />

      {day && <DayDetailPanel dayKey={day} events={eventsByDay[day] ?? []} customerLabels={customerLabels} />}
    </div>
  );
}
